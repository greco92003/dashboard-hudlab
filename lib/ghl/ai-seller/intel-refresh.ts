import "server-only";

import { fetchGhlPipelines, fetchOpportunityById } from "@/lib/ghl/api";
import {
  findPhoneConversationId,
  getRecentWhatsappMessages,
} from "@/lib/ghl/negotiation-conversations";
import { isGhlWonDeal } from "@/lib/ghl/pipelines";
import { createSupabaseServerForSync } from "@/lib/supabase/server";
import { fetchAllSupabaseRows } from "@/lib/supabase-pagination";
import { GHL_ATENDIMENTO_PIPELINE_ID } from "./config";
import { summarizeConversation, type FunnelRanks, type IntelHandoff, type IntelRun } from "./intel";
import { sendHandoffAlerts } from "./alerts-send";
import { loadSellerSettings } from "./settings";

/** Clientes assumidos há mais que isso saem do resumo (a página olha no máximo 30 dias). */
const LOOKBACK_MS = 45 * 24 * 60 * 60 * 1000;
/** Passagens mais velhas que isso sem resposta não são mais conferidas no GHL. */
const HANDOFF_CHECK_MS = 72 * 60 * 60 * 1000;
const CONCURRENCY = 5;

async function mapWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

interface HandoffRow extends IntelHandoff {
  id: string;
  contact_id: string;
  opportunity_id: string | null;
}

/**
 * Passagens ainda sem resposta: alguém do time escreveu ao cliente depois?
 * Mensagem humana = saída com userId (mesma regra da Cami).
 */
async function checkPendingHandoffs(
  supabase: Awaited<ReturnType<typeof createSupabaseServerForSync>>,
  now: number,
): Promise<number> {
  const { data, error } = await supabase
    .from("ai_seller_handoffs")
    .select("id, contact_id, escalated_at")
    .is("answered_at", null)
    .gte("escalated_at", new Date(now - HANDOFF_CHECK_MS).toISOString());
  if (error) throw new Error(`ai_seller_handoffs: ${error.message}`);
  let answered = 0;
  await mapWithConcurrency(data ?? [], CONCURRENCY, async (h) => {
    try {
      const conversationId = await findPhoneConversationId(h.contact_id);
      if (!conversationId) return;
      const messages = await getRecentWhatsappMessages(conversationId, 50);
      const reply = messages.find(
        (m) => m.direction === "outbound" && m.userId && !m.isAutomated && m.dateAdded > h.escalated_at,
      );
      if (!reply) return;
      const { error: updateError } = await supabase
        .from("ai_seller_handoffs")
        .update({ answered_at: reply.dateAdded, answered_by: reply.userId })
        .eq("id", h.id);
      if (updateError) throw new Error(updateError.message);
      answered++;
    } catch (err) {
      console.error("CAMI Intelligence: passagem não conferida", { handoffId: h.id, err });
    }
  });
  return answered;
}

/**
 * Recalcula ai_seller_conversations: uma linha por oportunidade que a Cami
 * assumiu nos últimos 45 dias, com etapa e status lidos agora no GHL.
 * Nunca escreve reviewed_* (é do owner).
 */
export async function refreshCamiIntel(): Promise<{
  conversas: number;
  passagensRespondidas: number;
  erros: number;
}> {
  const supabase = await createSupabaseServerForSync();
  const now = Date.now();
  const settings = await loadSellerSettings();
  const passagensRespondidas = await checkPendingHandoffs(supabase, now);
  // Avisos depois da conferência: passagem que acabou de ser respondida não gera alerta.
  try {
    await sendHandoffAlerts(settings, now);
  } catch (err) {
    console.error("CAMI Intelligence: alertas de passagem não enviados", err);
  }

  const { data: assignments, error: assignError } = await supabase
    .from("ai_seller_assignments")
    .select("contact_id, opportunity_id, pares, created_at")
    .eq("decisao", "assumiu")
    .gte("created_at", new Date(now - LOOKBACK_MS).toISOString())
    .order("created_at", { ascending: true });
  if (assignError) throw new Error(`ai_seller_assignments: ${assignError.message}`);

  // Mesma oportunidade assumida duas vezes (reentrada no workflow): vale a primeira.
  const byOpportunity = new Map<string, { contact_id: string; opportunity_id: string; pares: number | null; created_at: string }>();
  for (const a of assignments ?? []) {
    if (a.opportunity_id && !byOpportunity.has(a.opportunity_id)) {
      byOpportunity.set(a.opportunity_id, a as { contact_id: string; opportunity_id: string; pares: number | null; created_at: string });
    }
  }
  const items = [...byOpportunity.values()];
  if (items.length === 0) return { conversas: 0, passagensRespondidas, erros: 0 };

  const contactIds = [...new Set(items.map((i) => i.contact_id))];
  const since = items[0].created_at;
  const [runs, handoffs, pipelines] = await Promise.all([
    fetchAllSupabaseRows<IntelRun & { contact_id: string }>(
      (from, to) =>
        supabase
          .from("ai_seller_runs")
          .select("contact_id, triggered_at, decision, escalation_reason, sent_message_ids, usage, client_message_at, replied_at")
          .in("contact_id", contactIds)
          .gte("triggered_at", since)
          .neq("decision", "rodando")
          .order("triggered_at", { ascending: true })
          .range(from, to),
      "ai_seller_runs",
    ),
    fetchAllSupabaseRows<HandoffRow>(
      (from, to) =>
        supabase
          .from("ai_seller_handoffs")
          .select("id, contact_id, opportunity_id, motivo, escalated_at, answered_at")
          .in("contact_id", contactIds)
          .gte("escalated_at", since)
          .order("escalated_at", { ascending: true })
          .range(from, to),
      "ai_seller_handoffs",
    ),
    fetchGhlPipelines(),
  ]);

  const pipelineName = new Map(pipelines.map((p) => [p.id, p.name]));
  const stageName = new Map(pipelines.flatMap((p) => (p.stages ?? []).map((s) => [s.id, s.name] as const)));
  const atendimentoStages = [...(pipelines.find((p) => p.id === GHL_ATENDIMENTO_PIPELINE_ID)?.stages ?? [])].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  );
  const rankOf = (name: string) => atendimentoStages.findIndex((s) => s.name.trim().toLowerCase() === name.toLowerCase());
  const ranks: FunnelRanks = {
    negociacao: rankOf("Negociação"),
    prioridade: rankOf("Prioridade de Fechamento"),
  };

  const rows: Record<string, unknown>[] = [];
  let erros = 0;
  await mapWithConcurrency(items, CONCURRENCY, async (item) => {
    try {
      const opp = await fetchOpportunityById(item.opportunity_id);
      const won = isGhlWonDeal(opp.pipelineId, opp.pipelineStageId, opp.status, opp.monetaryValue);
      const stageRank =
        opp.pipelineId === GHL_ATENDIMENTO_PIPELINE_ID
          ? atendimentoStages.findIndex((s) => s.id === opp.pipelineStageId)
          : -1;
      const contactRuns = runs.filter((r) => r.contact_id === item.contact_id && r.triggered_at >= item.created_at);
      const handoff =
        [...handoffs]
          .reverse()
          .find((h) => h.contact_id === item.contact_id && h.escalated_at >= item.created_at) ?? null;
      const summary = summarizeConversation({
        runs: contactRuns,
        handoff,
        opp: { status: opp.status ?? null, won, stageRank: stageRank >= 0 ? stageRank : null },
        ranks,
        now,
        shifts: settings.shifts,
      });
      rows.push({
        opportunity_id: item.opportunity_id,
        contact_id: item.contact_id,
        contact_name: opp.contact?.name ?? opp.name ?? null,
        pares: item.pares,
        assigned_at: item.created_at,
        pipeline_name: opp.pipelineId ? pipelineName.get(opp.pipelineId) ?? null : null,
        stage_name: opp.pipelineStageId ? stageName.get(opp.pipelineStageId) ?? null : null,
        opp_status: opp.status ?? null,
        monetary_value: opp.monetaryValue ?? null,
        situacao: summary.situacao,
        reached_negociacao: summary.reachedNegociacao,
        reached_prioridade: summary.reachedPrioridade,
        client_replied: summary.clientReplied,
        handoff_motivo: handoff?.motivo ?? null,
        handoff_at: handoff?.escalated_at ?? null,
        handoff_answered_at: handoff?.answered_at ?? null,
        last_client_at: summary.lastClientAt,
        last_cami_at: summary.lastCamiAt,
        replies: summary.replies,
        tokens_in: summary.tokensIn,
        tokens_out: summary.tokensOut,
        max_response_ms: summary.maxResponseMs,
        signals: summary.signals,
        updated_at: new Date(now).toISOString(),
      });
    } catch (err) {
      erros++;
      console.error("CAMI Intelligence: conversa não atualizada", { opportunityId: item.opportunity_id, err });
    }
  });

  // Todas as linhas com as mesmas colunas: o upsert em lote do PostgREST
  // preenche com null a coluna que falta numa linha.
  if (rows.length) {
    const { error } = await supabase.from("ai_seller_conversations").upsert(rows, { onConflict: "opportunity_id" });
    if (error) throw new Error(`ai_seller_conversations upsert: ${error.message}`);
  }
  return { conversas: rows.length, passagensRespondidas, erros };
}
