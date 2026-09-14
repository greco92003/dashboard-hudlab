import { getSupabaseSecretKey } from "@/lib/supabase/keys-server";
import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  GHL_FUNNEL_STAGES,
  normalizeGhlFunnelStage,
} from "@/lib/ghl/funnel";
import {
  sha256Hex,
  WEBHOOK_MAX_BODY_BYTES,
  validateOptionalWebhookTimestamp,
} from "@/lib/security/webhook-verification";
import {
  buildWebhookIdempotencyKey,
  claimWebhookEvent,
  releaseWebhookEvent,
} from "@/lib/security/webhook-idempotency";
import {
  impressaoDaAutorizacao,
  logWebhookRejection,
  type WebhookRejectionReason,
} from "@/lib/security/webhook-rejections";

const ROTA = "/api/webhooks/ghl/funnel";

/**
 * Recusa registrada. Toda saída de erro daqui passa por esta função: um 401
 * silencioso deixou o funil 42 h sem dado em 02-04/09/2026 enquanto o GHL
 * seguia disparando 103 requisições por dia.
 */
function recusar(
  motivo: WebhookRejectionReason,
  status: number,
  corpo: Record<string, unknown>,
  detalhe?: Record<string, unknown>,
) {
  void logWebhookRejection({
    provider: "ghl",
    rota: ROTA,
    motivo,
    status,
    detalhe,
  });
  return NextResponse.json({ received: false, ...corpo }, { status });
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.GHL_WEBHOOK_SECRET;
  if (!secret) return false;

  const actual = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function parseTags(value: unknown): string[] {
  const tags = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return Array.from(
    new Set(
      tags
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string" || !value.trim()) return null;

  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

// Faturamento/Vendas (Visão Geral) vêm 100% do dado VIVO da oportunidade
// via sync-ghl, nunca do payload congelado do webhook (ver lição de
// 2026-07-23: valor pode ser corrigido depois do webhook original) --
// então o webhook sozinho não pode atualizar o número. Mas sync-ghl só
// roda 1x/dia via cron + quando alguém clica "Atualizar", então um
// negócio marcado como ganho no meio do dia só aparecia no dashboard
// no dia seguinte (ou se alguém lembrasse de clicar). Fix pedido pelo
// usuário em 2026-08-12: usar o próprio webhook de "negócio fechado"
// como GATILHO de um sync imediato -- dispara sem esperar a resposta
// (não pode atrasar o 201 que devolvemos pro GHL) e não falha o
// webhook se o sync falhar (é só uma tentativa de atualização mais
// rápida, o cron diário continua sendo a rede de segurança).
function dispararSyncGhl() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return;
  fetch(`${supabaseUrl}/functions/v1/sync-ghl`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }).catch((err) => {
    console.error("[GHL Funnel] Falha ao disparar sync-ghl após negociofechado", err);
  });
}

export async function POST(request: NextRequest) {
  if (!process.env.GHL_WEBHOOK_SECRET) {
    console.error("[GHL Funnel] GHL_WEBHOOK_SECRET is not configured");
    return recusar("nao_configurado", 503, {
      error: "Webhook receiver is not configured",
    });
  }

  if (!isAuthorized(request)) {
    console.warn("[GHL Funnel] Rejected request with invalid authorization");
    return recusar(
      "autorizacao_invalida",
      401,
      { error: "Unauthorized" },
      impressaoDaAutorizacao(request.headers.get("authorization")),
    );
  }

  const rawBody = await request.text();
  if (!rawBody) {
    return recusar("corpo_vazio", 400, { error: "Empty payload" });
  }
  if (Buffer.byteLength(rawBody, "utf8") > WEBHOOK_MAX_BODY_BYTES) {
    return recusar("corpo_grande_demais", 413, { error: "Payload too large" }, {
      bytes: Buffer.byteLength(rawBody, "utf8"),
    });
  }

  let payload: JsonRecord;
  try {
    payload = asRecord(JSON.parse(rawBody));
  } catch {
    return recusar("json_invalido", 400, { error: "Invalid JSON payload" });
  }

  const customData = asRecord(payload.customData);
  const location = asRecord(payload.location);
  const workflow = asRecord(payload.workflow);
  const suppliedTimestamp =
    customData.event_timestamp ??
    customData.timestamp ??
    payload.timestamp ??
    payload.event_timestamp;
  const timestampValidation = validateOptionalWebhookTimestamp(suppliedTimestamp);
  if (!timestampValidation.ok) {
    const antigo = timestampValidation.error === "stale_timestamp";
    return recusar(
      antigo ? "timestamp_antigo" : "timestamp_invalido",
      antigo ? 409 : 400,
      { error: antigo ? "Stale webhook rejected" : "Invalid timestamp" },
      { timestamp_recebido: String(suppliedTimestamp ?? "") },
    );
  }
  const requestTimestamp = timestampValidation.timestamp;
  const rawStage = firstString(
    customData.stage_slug,
    customData.stage,
    payload.stage_slug,
    payload.stage,
    payload.tag,
  );
  const stage = normalizeGhlFunnelStage(rawStage);

  if (!stage) {
    console.warn("[GHL Funnel] Rejected unknown stage", { rawStage });
    return recusar(
      "etapa_desconhecida",
      422,
      { error: "Unknown funnel stage", stage: rawStage },
      { etapa_recebida: rawStage },
    );
  }

  const contactId = firstString(customData.contact_id, payload.contact_id);
  if (!contactId) {
    return recusar("sem_contact_id", 422, { error: "Missing contact_id" }, {
      etapa: stage,
    });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = getSupabaseSecretKey();
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[GHL Funnel] Supabase persistence is not configured");
    return recusar("persistencia_indisponivel", 503, {
      error: "Persistence is not configured",
    });
  }

  const explicitEventId = firstString(
    payload.webhookId,
    payload.eventId,
    customData.webhook_id,
    customData.event_id,
  );
  const claimInput = {
    provider: "ghl",
    idempotencyKey: buildWebhookIdempotencyKey(
      "ghl",
      explicitEventId,
      rawBody,
    ),
    payloadSha256: sha256Hex(rawBody),
    requestTimestamp,
  } as const;
  const claim = await claimWebhookEvent(claimInput);
  if (!claim.claimed) {
    return NextResponse.json(
      { received: true, duplicate: true },
      { status: 200 },
    );
  }

  const firstName = firstString(payload.first_name);
  const lastName = firstString(payload.last_name);
  const fallbackName = [firstName, lastName].filter(Boolean).join(" ") || null;
  const contactName = firstString(
    customData.contact_name,
    payload.full_name,
    fallbackName,
  );
  const eventType =
    firstString(customData.event, payload.event) ?? "contact_tag_added";
  const quantity = parseNumber(
    customData.quantidade_pares ??
      customData.qntd_pares ??
      payload["Qntd Pares"] ??
      payload.quantidade_pares,
  );

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase
    .from("ghl_funnel_events")
    .insert({
      event_type: eventType,
      stage_slug: stage,
      stage_name: GHL_FUNNEL_STAGES[stage],
      contact_id: contactId,
      contact_name: contactName,
      contact_email: firstString(customData.contact_email, payload.email),
      contact_phone: firstString(customData.contact_phone, payload.phone),
      contact_company_name: firstString(
        customData.contact_company_name,
        payload.company_name,
        payload.Empresa,
      ),
      quantidade_pares: quantity,
      tags: parseTags(payload.tags),
      location_id: firstString(customData.location_id, location.id),
      workflow_id: firstString(workflow.id),
      workflow_name: firstString(workflow.name),
      contact_created_at: parseDate(payload.date_created),
      raw_payload: payload,
    })
    .select("id, received_at")
    .single();

  if (error) {
    console.error("[GHL Funnel] Failed to persist webhook", {
      code: error.code,
      message: error.message,
      stage,
    });
    try {
      await releaseWebhookEvent(claimInput);
    } catch (releaseError) {
      console.error("[GHL Funnel] Failed to release retry claim", releaseError);
    }
    return recusar("falha_ao_gravar", 500, { error: "Failed to persist webhook" }, {
      etapa: stage,
      codigo: error.code,
      mensagem: error.message,
    });
  }

  if (stage === "negociofechado") {
    dispararSyncGhl();
  }

  return NextResponse.json(
    {
      received: true,
      eventId: data.id,
      stage,
      stageName: GHL_FUNNEL_STAGES[stage],
      receivedAt: data.received_at,
    },
    { status: 201 },
  );
}

export async function GET() {
  return NextResponse.json({
    status: process.env.GHL_WEBHOOK_SECRET ? "ready" : "not_configured",
    service: "ghl-funnel-webhook",
    stages: Object.keys(GHL_FUNNEL_STAGES),
  });
}

export const runtime = "nodejs";
