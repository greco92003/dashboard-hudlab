import "server-only";

import {
  fetchGhlPipelines,
  fetchOpportunityById,
  findStageIdByName,
  updateGhlOpportunity,
} from "@/lib/ghl/api";
import { GHL_MOCKUP_FACTORY_PIPELINE_ID } from "@/lib/ghl/pipelines";
import { packPairsIntoVolumes } from "@/lib/freight/packing";
import { quoteFreight } from "@/lib/freight/quote";
import { createSupabaseServerForSync } from "@/lib/supabase/server";
import {
  ART_CHANGE_STAGE_NAME,
  GHL_ATENDIMENTO_PIPELINE_ID,
  type AiMovableStage,
} from "./config";
import { roundMoney } from "./pricing";

const GHL_BASE_URL =
  process.env.GHL_API_BASE_URL || "https://services.leadconnectorhq.com";
const CONVERSATIONS_VERSION = "2021-04-15";
const CONTACTS_VERSION = "2021-07-28";

type Method = "GET" | "POST" | "PUT" | "DELETE";

/**
 * `retry` é decisão de quem chama: só chamadas idempotentes repetem em 429/5xx.
 * O envio de WhatsApp nunca repete (mensagem duplicada para o cliente).
 */
async function ghlCall<T>(
  path: string,
  method: Method,
  version: string,
  options: { body?: unknown; retry: boolean },
): Promise<T> {
  const token = process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
  if (!token) throw new Error("GHL_PRIVATE_INTEGRATION_TOKEN não configurado");
  const url = new URL(path, GHL_BASE_URL);
  const { body } = options;
  const attempts = options.retry ? 3 : 1;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Version: version,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    if ((response.status === 429 || response.status >= 500) && attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 750 * 2 ** attempt));
      continue;
    }
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`GHL API ${response.status} em ${method} ${url.pathname}: ${text.slice(0, 300)}`);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }
  throw new Error(`GHL API falhou em ${method} ${url.pathname}`);
}

export async function sendWhatsAppMessage(
  contactId: string,
  message: string,
): Promise<string> {
  const data = await ghlCall<{ messageId?: string }>(
    "/conversations/messages",
    "POST",
    CONVERSATIONS_VERSION,
    { body: { type: "WhatsApp", contactId, message }, retry: false },
  );
  if (!data.messageId) throw new Error("GHL não devolveu messageId no envio");
  return data.messageId;
}

/** Mensagens de WhatsApp mais recentes da conversa (só id e direção). */
export async function fetchRecentWhatsAppMessages(
  conversationId: string,
  limit = 20,
): Promise<Array<{ id: string; direction: "inbound" | "outbound" }>> {
  const data = await ghlCall<{
    messages?: { messages?: Array<{ id: string; direction: "inbound" | "outbound"; messageType?: string }> };
  }>(`/conversations/${conversationId}/messages?limit=${limit}`, "GET", CONVERSATIONS_VERSION, {
    retry: true,
  });
  return (data.messages?.messages ?? [])
    .filter((m) => m.messageType === "TYPE_WHATSAPP")
    .map((m) => ({ id: m.id, direction: m.direction }));
}

export async function addContactTags(contactId: string, tags: string[]): Promise<void> {
  await ghlCall(`/contacts/${contactId}/tags`, "POST", CONTACTS_VERSION, {
    body: { tags },
    retry: true,
  });
}

export async function removeContactTags(contactId: string, tags: string[]): Promise<void> {
  await ghlCall(`/contacts/${contactId}/tags`, "DELETE", CONTACTS_VERSION, {
    body: { tags },
    retry: true,
  });
}

export async function assignContact(contactId: string, userId: string): Promise<void> {
  await ghlCall(`/contacts/${contactId}`, "PUT", CONTACTS_VERSION, {
    body: { assignedTo: userId },
    retry: true,
  });
}

/** Cadeia do orçamento: valores gravados, não fórmulas (memória ghl-escrita-via-api). */
export const BUDGET_FIELDS = {
  oppPares: "TFp4L5VxK9mHBaAMXyo7",
  oppUnitario: "Tw2UZe2XgRIBhRXEwg4k",
  contactPares: "APXFcsShy3vQ3YX6lvyd",
  contactUnitario: "TRBawWiHzT2ABAG3kcam",
  contactSubtotal: "Kt2npElalasCf4ltKFSQ",
  contactFrete: "RFntWWslwNzkGGVJExCC",
  contactTotal: "b1wqJVGzZSqBv4dITtqn",
} as const;

export async function writeBudgetChain(input: {
  contactId: string;
  opportunityId: string;
  pares: number;
  unitario: number;
  subtotal: number;
  frete: number | null;
}): Promise<void> {
  await updateGhlOpportunity(input.opportunityId, {
    monetaryValue: input.subtotal,
    customFields: [
      { id: BUDGET_FIELDS.oppPares, fieldValue: input.pares },
      { id: BUDGET_FIELDS.oppUnitario, fieldValue: input.unitario },
    ],
  });

  // Frete desconhecido limpa frete e total ("" esvazia campo numérico): o
  // valor de um orçamento anterior não pode ficar parecendo o atual.
  const contactFields: Array<{ id: string; value: number | "" }> = [
    { id: BUDGET_FIELDS.contactPares, value: input.pares },
    { id: BUDGET_FIELDS.contactUnitario, value: input.unitario },
    { id: BUDGET_FIELDS.contactSubtotal, value: input.subtotal },
    { id: BUDGET_FIELDS.contactFrete, value: input.frete ?? "" },
    {
      id: BUDGET_FIELDS.contactTotal,
      value: input.frete == null ? "" : roundMoney(input.subtotal + input.frete),
    },
  ];
  // Contato usa snake_case (field_value); oportunidade usa camelCase.
  await ghlCall(`/contacts/${input.contactId}`, "PUT", CONTACTS_VERSION, {
    body: { customFields: contactFields.map((f) => ({ id: f.id, field_value: f.value })) },
    retry: true,
  });
}

export async function moveOpportunityForward(
  opportunityId: string,
  etapa: AiMovableStage,
): Promise<"movido" | "sem_mudanca" | "fora_do_atendimento"> {
  const opportunity = await fetchOpportunityById(opportunityId);
  // Na Fábrica de Mockups a arte está sendo feita: tirar de lá quebraria o
  // fluxo do design.
  if (opportunity.pipelineId !== GHL_ATENDIMENTO_PIPELINE_ID) return "fora_do_atendimento";

  const pipelines = await fetchGhlPipelines();
  const stages =
    pipelines.find((p) => p.id === GHL_ATENDIMENTO_PIPELINE_ID)?.stages ?? [];
  const currentIndex = stages.findIndex((s) => s.id === opportunity.pipelineStageId);
  const targetIndex = stages.findIndex(
    (s) => s.name.trim().toLowerCase() === etapa.toLowerCase(),
  );
  if (targetIndex < 0) throw new Error(`Etapa "${etapa}" não existe no pipeline Atendimento`);
  // Etapa atual desconhecida (renomeada ou removida): sem saber a direção, não move.
  if (currentIndex < 0 || currentIndex >= targetIndex) return "sem_mudanca";

  await updateGhlOpportunity(opportunityId, { pipelineStageId: stages[targetIndex].id });
  return "movido";
}

export async function moveOpportunityToArtChange(
  opportunityId: string,
): Promise<"movido" | "ja_em_alteracao"> {
  const stageId = await findStageIdByName(
    GHL_MOCKUP_FACTORY_PIPELINE_ID,
    ART_CHANGE_STAGE_NAME,
  );
  if (!stageId) throw new Error(`Etapa "${ART_CHANGE_STAGE_NAME}" não encontrada na Fábrica de Mockups`);
  const opportunity = await fetchOpportunityById(opportunityId);
  if (opportunity.pipelineStageId === stageId) return "ja_em_alteracao";

  await updateGhlOpportunity(opportunityId, {
    pipelineId: GHL_MOCKUP_FACTORY_PIPELINE_ID,
    pipelineStageId: stageId,
  });
  return "movido";
}

/** Menor frete entre as tabelas ativas e a API; null se não houver cotação. */
export async function quoteFreightForPares(input: {
  cep: string;
  pares: number;
  valorNf: number;
}): Promise<number | null> {
  const supabase = await createSupabaseServerForSync();
  const { data: volumes, error } = await supabase
    .from("freight_volumes")
    .select("id, pairs_capacity")
    .eq("active", true);
  if (error) throw new Error(`freight_volumes: ${error.message}`);

  const selection = packPairsIntoVolumes(
    input.pares,
    (volumes ?? []) as Array<{ id: string; pairs_capacity: number }>,
  );
  if (selection.length === 0) return null;

  const outcome = await quoteFreight(supabase, {
    destino: input.cep.replace(/\D/g, ""),
    volumes: selection,
    valor_nf: input.valorNf,
  });
  if (!outcome.ok || outcome.body.results.length === 0) return null;
  return roundMoney(outcome.body.results[0].quote.total);
}
