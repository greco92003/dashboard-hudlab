import "server-only";

import {
  fetchGhlPipelines,
  searchGhlOpportunitiesByContact,
  type GhlOpportunity,
} from "@/lib/ghl/api";
import {
  computeResponseGapStats,
  getQtyParesForOpportunity,
  getRecentWhatsappMessages,
  getVendedorForOpportunity,
  searchUnreadWhatsappConversations,
  type UnreadWhatsappConversation,
} from "@/lib/ghl/negotiation-conversations";
import { isGhlWonDeal } from "@/lib/ghl/pipelines";
import { runCopiloto, runTriage, type CopilotoReport } from "@/lib/ghl/sales-agent/agent";
import { createSupabaseServerForSync } from "@/lib/supabase/server";
import {
  cutTranscript,
  isPostSale,
  isWindowOpen,
  lastClientMessageText,
  type TriageCategory,
} from "./triage";

const TABLE = "ghl_unread_triage";
/** Conversas processadas ao mesmo tempo: cabe no limite do GHL (100 req/10s) e da rota. */
const CONCURRENCY = 5;

interface PipelineIndex {
  pipelineName: Map<string, string>;
  stageName: Map<string, string>;
  atendimentoStages: string[];
}

async function loadPipelineIndex(): Promise<PipelineIndex> {
  const pipelines = await fetchGhlPipelines();
  const pipelineName = new Map<string, string>();
  const stageName = new Map<string, string>();
  let atendimentoStages: string[] = [];
  for (const p of pipelines) {
    pipelineName.set(p.id, p.name);
    const stages = [...(p.stages ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    for (const s of stages) stageName.set(s.id, s.name);
    if (p.name === "Atendimento") atendimentoStages = stages.map((s) => s.name);
  }
  return { pipelineName, stageName, atendimentoStages };
}

/** Negociação aberta mais recente; sem ela, a venda ganha mais recente (pós-venda). */
function pickOpportunity(opportunities: GhlOpportunity[]): { opportunity: GhlOpportunity; won: boolean } | null {
  const byNewest = [...opportunities].sort((a, b) =>
    (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
  );
  const won = (o: GhlOpportunity) =>
    isGhlWonDeal(o.pipelineId, o.pipelineStageId, o.status, o.monetaryValue);
  const open = byNewest.find((o) => (o.status ?? "open") === "open" && !won(o));
  if (open) return { opportunity: open, won: false };
  const lastWon = byNewest.find(won);
  return lastWon ? { opportunity: lastWon, won: true } : null;
}

async function mapWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const item = items[next++];
        await fn(item);
      }
    }),
  );
}

interface ExistingRow {
  conversation_id: string;
  category: TriageCategory | null;
  reason: string | null;
  subject: string | null;
  classified_message_id: string | null;
  classified_at: string | null;
}

/**
 * A fila é gravada num upsert em lote, e o PostgREST preenche com null a
 * coluna que falta numa linha: toda linha leva a classificação inteira,
 * mesmo quando só repete a que já estava guardada.
 */
function keptClassification(existing: ExistingRow | undefined): Record<string, unknown> {
  return {
    category: existing?.category ?? null,
    reason: existing?.reason ?? null,
    subject: existing?.subject ?? null,
    classified_message_id: existing?.classified_message_id ?? null,
    classified_at: existing?.classified_at ?? null,
  };
}

async function triageConversation(
  conversation: UnreadWhatsappConversation,
  index: PipelineIndex,
  existing: ExistingRow | undefined,
  refreshedAt: string,
): Promise<Record<string, unknown>> {
  const [messages, opportunities] = await Promise.all([
    getRecentWhatsappMessages(conversation.conversationId),
    searchGhlOpportunitiesByContact(conversation.contactId),
  ]);
  const picked = pickOpportunity(opportunities);
  const opportunity = picked?.opportunity ?? null;
  const pipelineName = opportunity?.pipelineId ? index.pipelineName.get(opportunity.pipelineId) ?? null : null;
  const stageName = opportunity?.pipelineStageId ? index.stageName.get(opportunity.pipelineStageId) ?? null : null;
  const [vendedor, qtyPares] = opportunity
    ? await Promise.all([getVendedorForOpportunity(opportunity), getQtyParesForOpportunity(opportunity)])
    : [null, null];
  const lastMessageId = messages.at(-1)?.id ?? null;

  const row: Record<string, unknown> = {
    conversation_id: conversation.conversationId,
    contact_id: conversation.contactId,
    contact_name: conversation.contactName,
    phone: conversation.phone,
    opportunity_id: opportunity?.id ?? null,
    pipeline_name: pipelineName,
    stage_name: stageName,
    vendedor,
    qty_pares: qtyPares,
    monetary_value: opportunity?.monetaryValue ?? null,
    unread_count: conversation.unreadCount,
    last_inbound_at: conversation.lastInboundAt,
    last_message_id: lastMessageId,
    last_message_body: lastClientMessageText(messages),
    is_unread: true,
    refreshed_at: refreshedAt,
  };

  // Classificação já feita sobre esta mesma última mensagem: não gasta de novo.
  if (existing?.category && existing.classified_message_id === lastMessageId) {
    return { ...row, ...keptClassification(existing), classify_error: null };
  }

  const won = picked?.won ?? false;
  if (isPostSale({ won, pipelineName, stageName, atendimentoStages: index.atendimentoStages })) {
    return {
      ...row,
      category: "pos_venda",
      reason: won
        ? `Venda ganha${stageName ? ` (card em ${stageName})` : ""}.`
        : `Pedido já pago: card em ${stageName}.`,
      subject: lastClientMessageText(messages)?.slice(0, 80) ?? null,
      classified_message_id: lastMessageId,
      classified_at: new Date().toISOString(),
      classify_error: null,
    };
  }

  try {
    const cut = cutTranscript(messages);
    const triage = await runTriage(cut.messages, { etapaCrm: stageName, qtyPares });
    return {
      ...row,
      category: triage.categoria,
      reason: triage.motivo,
      subject: triage.assunto,
      classified_message_id: lastMessageId,
      classified_at: new Date().toISOString(),
      classify_error: null,
    };
  } catch (err) {
    console.error("Triagem de não lida falhou", { conversationId: conversation.conversationId, err });
    // Falhou: mantém a classificação anterior em vez de apagar.
    return {
      ...row,
      ...keptClassification(existing),
      classify_error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Relê as não lidas de WhatsApp do GHL, classifica o que mudou e reescreve a
 * fila. Conversa lida, respondida ou fora da janela de 24h sai da fila
 * (is_unread = false).
 */
export async function refreshUnreadInbox(): Promise<{ total: number; errors: number }> {
  const supabase = await createSupabaseServerForSync();
  const [unread, index] = await Promise.all([
    searchUnreadWhatsappConversations(),
    loadPipelineIndex(),
  ]);
  // Só quem ainda pode receber texto livre: fora da janela de 24h a fila não mostra (e não gasta IA).
  const now = Date.now();
  const conversations = unread.filter((c) => isWindowOpen(Date.parse(c.lastInboundAt), now));

  const ids = conversations.map((c) => c.conversationId);
  const { data: existingRows, error: existingError } = ids.length
    ? await supabase
        .from(TABLE)
        .select("conversation_id, category, reason, subject, classified_message_id, classified_at")
        .in("conversation_id", ids)
    : { data: [], error: null };
  if (existingError) throw new Error(`${TABLE}: ${existingError.message}`);
  const existing = new Map((existingRows as ExistingRow[]).map((r) => [r.conversation_id, r]));

  const refreshedAt = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];
  let errors = 0;
  await mapWithConcurrency(conversations, CONCURRENCY, async (conversation) => {
    try {
      const row = await triageConversation(conversation, index, existing.get(conversation.conversationId), refreshedAt);
      if (row.classify_error) errors++;
      rows.push(row);
    } catch (err) {
      errors++;
      console.error("Não lida não processada", { conversationId: conversation.conversationId, err });
    }
  });

  if (rows.length) {
    const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: "conversation_id" });
    if (error) throw new Error(`${TABLE} upsert: ${error.message}`);
  }

  // O que não voltou como não lido foi respondido ou lido no GHL.
  let staleQuery = supabase.from(TABLE).update({ is_unread: false }).eq("is_unread", true);
  if (ids.length) staleQuery = staleQuery.not("conversation_id", "in", `(${ids.map((id) => `"${id}"`).join(",")})`);
  const { error: staleError } = await staleQuery;
  if (staleError) throw new Error(`${TABLE} lidas: ${staleError.message}`);

  return { total: conversations.length, errors };
}

/** Insight e sugestão de resposta para uma não lida, com a conversa cortada na amostra digital. */
export async function generateUnreadInsight(conversationId: string): Promise<CopilotoReport> {
  const supabase = await createSupabaseServerForSync();
  const { data: row, error } = await supabase
    .from(TABLE)
    .select("conversation_id, stage_name, vendedor, qty_pares, monetary_value")
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (error) throw new Error(`${TABLE}: ${error.message}`);
  if (!row) throw new Error("Conversa não está na fila de não lidas");

  const messages = await getRecentWhatsappMessages(conversationId);
  const cut = cutTranscript(messages);
  const report = await runCopiloto(
    cut.messages,
    computeResponseGapStats(cut.messages),
    {
      vendedor: row.vendedor,
      etapaCrm: row.stage_name,
      valorNegociacao: row.monetary_value == null ? null : Number(row.monetary_value),
      qtyPares: row.qty_pares,
    },
    { recorte: cut.from },
  );

  const { error: saveError } = await supabase
    .from(TABLE)
    .update({
      insight: report,
      insight_message_id: messages.at(-1)?.id ?? null,
      insight_at: new Date().toISOString(),
    })
    .eq("conversation_id", conversationId);
  if (saveError) console.error("Insight da não lida não foi salvo", saveError);

  return report;
}
