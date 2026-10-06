import "server-only";

import { after, NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchGhlDealContext, mapGhlDealContext } from "@/lib/ghl/api";
import { upsertGhlDeals } from "@/lib/ghl/deals-cache";
import { verifyGhlWebhook } from "@/lib/ghl/webhook";
import {
  isGhlOpportunityEvent,
  shouldRunMockupWebhookConsumer,
} from "@/lib/ghl/webhook-routing";
import { processMockupInstructionWebhook } from "@/lib/ghl/mockup-instructions/processor";
import { getSupabaseSecretKey } from "@/lib/supabase/keys-server";
import {
  removerNegocioSolados,
  sincronizarNegocioSolados,
} from "@/lib/estoque/solados-source";
import {
  buildWebhookIdempotencyKey,
  claimWebhookEvent,
} from "@/lib/security/webhook-idempotency";
import {
  sha256Hex,
  WEBHOOK_MAX_BODY_BYTES,
} from "@/lib/security/webhook-verification";
import {
  impressaoDaAutorizacao,
  logWebhookRejection,
  type WebhookRejectionReason,
} from "@/lib/security/webhook-rejections";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function parsePayload(rawBody: string) {
  const parsed = JSON.parse(rawBody);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid JSON object");
  }

  const payload = parsed as JsonRecord;
  const opportunity = record(payload.opportunity);
  const customData = record(payload.customData);
  const eventType =
    firstString(payload.type, payload.eventType, payload.event, customData.event) ||
    "OpportunityUpdate";
  const explicitOpportunityId = firstString(
    payload.opportunityId,
    payload.opportunity_id,
    opportunity.id,
    customData.opportunityId,
    customData.opportunity_id,
    customData.deal_id,
  );

  return {
    payload,
    eventType,
    // Em evento nativo, `id` é a oportunidade. Em Custom Webhook, exigimos
    // uma chave explícita para não confundir o id de contato com o de negócio.
    opportunityId:
      explicitOpportunityId ||
      (isGhlOpportunityEvent(eventType) ? firstString(payload.id) : null),
    pipelineId: firstString(
      payload.pipelineId,
      payload.pipeline_id,
      opportunity.pipelineId,
      opportunity.pipeline_id,
      customData.pipelineId,
      customData.pipeline_id,
    ),
    locationId: firstString(
      payload.locationId,
      payload.location_id,
      customData.locationId,
      customData.location_id,
    ),
    webhookId: firstString(
      payload.webhookId,
      payload.eventId,
      customData.event_id,
    ),
  };
}

async function syncOpportunity(input: {
  opportunityId: string;
  eventType: string;
  webhookId: string | null;
  rawBody: string;
  requestId: string;
}) {
  const claimInput = {
    provider: "ghl" as const,
    idempotencyKey: buildWebhookIdempotencyKey(
      "ghl",
      input.webhookId,
      input.rawBody,
    ),
    payloadSha256: sha256Hex(input.rawBody),
    requestTimestamp: null,
  };

  if (input.eventType.toLowerCase().includes("delete")) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) throw new Error("Supabase URL is not configured");
    const supabase = createClient(url, getSupabaseSecretKey(), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await supabase
      .from("deals_cache")
      .delete()
      .eq("source_system", "ghl")
      .eq("deal_id", input.opportunityId);
    if (error) throw error;
    await sincronizarEstoque(() => removerNegocioSolados(input.opportunityId));
    const claim = await claimWebhookEvent(claimInput);
    return { deleted: true, duplicate: !claim.claimed };
  }

  const context = await fetchGhlDealContext(input.opportunityId);
  await upsertGhlDeals([mapGhlDealContext(context)], "webhook", input.requestId);
  await sincronizarEstoque(() => sincronizarNegocioSolados(context));
  const claim = await claimWebhookEvent(claimInput);
  return { deleted: false, duplicate: !claim.claimed };
}

/**
 * O estoque de solados é mais um consumidor da mesma leitura por id. Falha
 * nele não derruba o sync de negócios: o botão Atualizar da tela refaz a
 * varredura inteira e corrige o que um evento perdido deixou para trás.
 */
async function sincronizarEstoque(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (error) {
    console.error("Estoque de solados: falha ao aplicar o webhook", error);
  }
}

async function processOpportunityConsumers(input: {
  payload: JsonRecord;
  opportunityId: string;
  pipelineId: string | null;
  eventType: string;
  webhookId: string | null;
  rawBody: string;
  requestId: string;
}) {
  const sync = await syncOpportunity(input);
  if (sync.deleted) return { sync, mockup: null };

  // O processador faz o filtro de pipeline/etapa. Assim, a mesma URL estável
  // atende Dashboard e Designers sem uma configuração substituir a outra no GHL.
  // Eventos nativos já trazem pipelineId; o pré-filtro evita gastar várias
  // chamadas à API do GHL em toda alteração de oportunidade fora dos Designers.
  const mockup = shouldRunMockupWebhookConsumer(input.pipelineId)
    ? await processMockupInstructionWebhook(input.payload)
    : null;
  return { sync, mockup };
}

export async function handleGhlOpportunityWebhook(request: NextRequest) {
  const rota = request.nextUrl.pathname;
  // Até 06/10/2026 estas recusas só voltavam como HTTP: o webhook de
  // negócios ficou de 04/09 a 06/10 sem gravar nada e não havia rastro no
  // banco. O sync de ganhos lê este registro para avisar o admin.
  const recusar = (
    motivo: WebhookRejectionReason,
    status: number,
    error: string,
    detalhe?: Record<string, unknown>,
  ) => {
    // after(): a função serverless pode encerrar logo depois da resposta.
    after(() => logWebhookRejection({ provider: "ghl", rota, motivo, status, detalhe }));
    return NextResponse.json({ accepted: false, error }, { status });
  };

  const rawBody = await request.text();
  if (!rawBody) return recusar("corpo_vazio", 400, "Empty body");
  if (Buffer.byteLength(rawBody, "utf8") > WEBHOOK_MAX_BODY_BYTES) {
    return recusar("corpo_grande_demais", 413, "Payload too large");
  }
  if (!verifyGhlWebhook(rawBody, request.headers)) {
    return recusar("autorizacao_invalida", 401, "Unauthorized", {
      assinatura_ghl: Boolean(request.headers.get("x-ghl-signature")),
      ...impressaoDaAutorizacao(request.headers.get("authorization")),
    });
  }

  let parsed: ReturnType<typeof parsePayload>;
  try {
    parsed = parsePayload(rawBody);
  } catch {
    return recusar("json_invalido", 400, "Invalid JSON");
  }

  if (
    parsed.locationId &&
    process.env.GHL_LOCATION_ID &&
    parsed.locationId !== process.env.GHL_LOCATION_ID
  ) {
    return recusar("location_errada", 403, "Wrong location");
  }

  // Outros tipos podem estar habilitados na mesma integração Marketplace.
  // Confirmá-los com 2xx evita que um evento fora do escopo derrube a saúde de
  // todos os webhooks da aplicação no circuit breaker do GHL.
  if (!isGhlOpportunityEvent(parsed.eventType) && !parsed.opportunityId) {
    // Confirma com 200 pelo circuit breaker, mas deixa rastro: se algum dia os
    // workflows de TAG do funil forem repontados para cá, os eventos sumiriam
    // em silêncio absoluto -- sem evento, sem reserva de idempotência (que só
    // acontece depois deste ponto) e sem erro, com o GHL vendo 200 e achando
    // que está tudo certo.
    void logWebhookRejection({
      provider: "ghl",
      rota: "/api/webhooks/ghl",
      motivo: "evento_ignorado",
      status: 200,
      detalhe: { tipo_de_evento: parsed.eventType },
    });
    return NextResponse.json({ accepted: true, ignored: true }, { status: 200 });
  }
  if (!parsed.opportunityId) {
    return NextResponse.json(
      { accepted: false, error: "Missing opportunity id" },
      { status: 422 },
    );
  }

  const processingInput = {
    ...parsed,
    rawBody,
    opportunityId: parsed.opportunityId,
    requestId:
      request.headers.get("x-vercel-id") ||
      parsed.webhookId ||
      crypto.randomUUID(),
  };

  if (request.nextUrl.searchParams.get("wait") === "1") {
    try {
      const result = await processOpportunityConsumers(processingInput);
      return NextResponse.json({ accepted: true, ...result }, { status: 200 });
    } catch (error) {
      console.error("GHL opportunity webhook processing failed", error);
      await logWebhookRejection({
        provider: "ghl",
        rota,
        motivo: "falha_ao_gravar",
        status: 500,
        detalhe: { opportunityId: parsed.opportunityId, erro: error instanceof Error ? error.message : "Unknown error" },
      });
      return NextResponse.json(
        { accepted: false, error: "Processing failed" },
        { status: 500 },
      );
    }
  }

  after(async () => {
    try {
      const result = await processOpportunityConsumers(processingInput);
      if (result.mockup && !result.mockup.accepted) {
        console.info("GHL opportunity ignored by mockup consumer", {
          opportunityId: parsed.opportunityId,
          reason: result.mockup.reason,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("GHL opportunity webhook background processing failed", {
        opportunityId: parsed.opportunityId,
        eventType: parsed.eventType,
        error: message,
      });
      // O GHL já recebeu 202 e não vai tentar de novo: sem este registro a
      // falha só existiria no log da Vercel.
      await logWebhookRejection({
        provider: "ghl",
        rota,
        motivo: "falha_ao_gravar",
        status: 202,
        detalhe: { opportunityId: parsed.opportunityId, tipo_de_evento: parsed.eventType, erro: message },
      });
    }
  });

  return NextResponse.json(
    { accepted: true, processing: "async" },
    { status: 202 },
  );
}

export function getGhlOpportunityWebhookStatus() {
  return NextResponse.json({
    service: "ghl-opportunity-webhook-dispatcher",
    status:
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.GHL_PRIVATE_INTEGRATION_TOKEN &&
      process.env.GHL_LOCATION_ID
        ? "ready"
        : "not_configured",
    consumers: ["deals-cache", "designer-mockup-instructions"],
  });
}
