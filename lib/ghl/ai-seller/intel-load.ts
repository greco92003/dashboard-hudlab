import "server-only";

import { createSupabaseServerForSync } from "@/lib/supabase/server";
import { fetchAllSupabaseRows } from "@/lib/supabase-pagination";
import {
  computeOverview,
  needsReview,
  periodStart,
  type Overview,
  type OverviewConversation,
  type Periodo,
} from "./intel";
import { loadSellerSettings, type SellerSettings } from "./settings";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerForSync>>;

export interface Baseline {
  periodoInicio: string;
  periodoFim: string;
  amostras: number;
  pctNegociacao: number | null;
  pctGanho30d: number | null;
  medianaPrimeiraRespostaMin: number | null;
  nResposta: number | null;
}

export interface OverviewPayload {
  periodo: Periodo;
  overview: Overview;
  baseline: Baseline | null;
  settings: SellerSettings;
  atualizadoEm: string | null;
}

const num = (v: unknown) => (v == null ? null : Number(v));

async function loadBaseline(supabase: Supabase): Promise<Baseline | null> {
  const { data, error } = await supabase.from("ai_seller_baseline").select("*").eq("id", 1).maybeSingle();
  if (error) throw new Error(`ai_seller_baseline: ${error.message}`);
  if (!data) return null;
  return {
    periodoInicio: data.periodo_inicio,
    periodoFim: data.periodo_fim,
    amostras: data.amostras,
    pctNegociacao: num(data.pct_negociacao),
    pctGanho30d: num(data.pct_ganho_30d),
    medianaPrimeiraRespostaMin: num(data.mediana_primeira_resposta_min),
    nResposta: data.n_resposta,
  };
}

export async function loadOverview(periodo: Periodo): Promise<OverviewPayload> {
  const supabase = await createSupabaseServerForSync();
  const now = Date.now();
  const fromMs = periodStart(periodo, now);
  const fromIso = fromMs == null ? "1970-01-01T00:00:00Z" : new Date(fromMs).toISOString();

  const [assignments, conversations, runs, handoffs, baseline, settings] = await Promise.all([
    fetchAllSupabaseRows<{ created_at: string; decisao: string }>(
      (from, to) =>
        supabase.from("ai_seller_assignments").select("created_at, decisao").gte("created_at", fromIso).order("created_at").range(from, to),
      "ai_seller_assignments",
    ),
    fetchAllSupabaseRows<OverviewConversation & { updated_at: string }>(
      (from, to) =>
        supabase
          .from("ai_seller_conversations")
          .select("assigned_at, situacao, client_replied, reached_negociacao, reached_prioridade, handoff_motivo, monetary_value, signals, updated_at")
          .gte("assigned_at", fromIso)
          .order("assigned_at")
          .range(from, to),
      "ai_seller_conversations",
    ),
    // Só rodadas de clientes reais: os testadores entram pelo fluxo de teste, sem entrada registrada.
    fetchAllSupabaseRows<{ triggered_at: string; usage: { input_tokens?: number; output_tokens?: number } | null; client_message_at: string | null; replied_at: string | null; contact_id: string }>(
      (from, to) =>
        supabase
          .from("ai_seller_runs")
          .select("contact_id, triggered_at, usage, client_message_at, replied_at")
          .gte("triggered_at", fromIso)
          .neq("decision", "rodando")
          .order("triggered_at")
          .range(from, to),
      "ai_seller_runs",
    ),
    fetchAllSupabaseRows<{ motivo: string; escalated_at: string; contact_id: string }>(
      (from, to) =>
        supabase.from("ai_seller_handoffs").select("contact_id, motivo, escalated_at").gte("escalated_at", fromIso).order("escalated_at").range(from, to),
      "ai_seller_handoffs",
    ),
    loadBaseline(supabase),
    loadSellerSettings(),
  ]);

  // Clientes da Cami = quem passou pela entrada. Rodadas e passagens dos testadores ficam de fora.
  const { data: camiContacts, error: contactsError } = await supabase
    .from("ai_seller_assignments")
    .select("contact_id")
    .eq("decisao", "assumiu");
  if (contactsError) throw new Error(`ai_seller_assignments: ${contactsError.message}`);
  const real = new Set((camiContacts ?? []).map((c) => c.contact_id as string));

  const overview = computeOverview({
    fromMs,
    assignments,
    conversations: conversations.map((c) => ({ ...c, monetary_value: num(c.monetary_value) })),
    runs: runs.filter((r) => real.has(r.contact_id)),
    handoffs: handoffs.filter((h) => real.has(h.contact_id)),
    custo: settings.custo,
  });

  const { data: last } = await supabase
    .from("ai_seller_conversations")
    .select("updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { periodo, overview, baseline, settings, atualizadoEm: last?.updated_at ?? null };
}

export interface ConversationItem {
  opportunityId: string;
  contactId: string;
  contactName: string | null;
  pares: number | null;
  assignedAt: string;
  stageName: string | null;
  pipelineName: string | null;
  situacao: string;
  monetaryValue: number | null;
  handoffMotivo: string | null;
  handoffAt: string | null;
  handoffAnsweredAt: string | null;
  lastClientAt: string | null;
  lastCamiAt: string | null;
  replies: number;
  maxResponseMs: number | null;
  signals: string[];
  paraRevisar: boolean;
  reviewedAt: string | null;
}

export async function loadConversations(): Promise<ConversationItem[]> {
  const supabase = await createSupabaseServerForSync();
  const rows = await fetchAllSupabaseRows<Record<string, unknown>>(
    (from, to) =>
      supabase.from("ai_seller_conversations").select("*").order("assigned_at", { ascending: false }).range(from, to),
    "ai_seller_conversations",
  );
  return rows.map((r) => ({
    opportunityId: r.opportunity_id as string,
    contactId: r.contact_id as string,
    contactName: (r.contact_name as string) ?? null,
    pares: (r.pares as number) ?? null,
    assignedAt: r.assigned_at as string,
    stageName: (r.stage_name as string) ?? null,
    pipelineName: (r.pipeline_name as string) ?? null,
    situacao: r.situacao as string,
    monetaryValue: num(r.monetary_value),
    handoffMotivo: (r.handoff_motivo as string) ?? null,
    handoffAt: (r.handoff_at as string) ?? null,
    handoffAnsweredAt: (r.handoff_answered_at as string) ?? null,
    lastClientAt: (r.last_client_at as string) ?? null,
    lastCamiAt: (r.last_cami_at as string) ?? null,
    replies: (r.replies as number) ?? 0,
    maxResponseMs: (r.max_response_ms as number) ?? null,
    signals: (r.signals as string[]) ?? [],
    paraRevisar: needsReview((r.signals as string[]) ?? [], (r.reviewed_signals as string[]) ?? []),
    reviewedAt: (r.reviewed_at as string) ?? null,
  }));
}

export interface RunDetail {
  triggeredAt: string;
  decision: string;
  escalationReason: string | null;
  latencyMs: number | null;
  tokensIn: number;
  tokensOut: number;
  responseMs: number | null;
  tools: string[];
  error: string | null;
}

export interface Promessa {
  at: string;
  pares: number | null;
  unitario: number | null;
  frete: number | null;
  total: number | null;
}

export interface ConversationDetail {
  runs: RunDetail[];
  promessas: Promessa[];
  passagem: { motivo: string; resumo: string | null; escalatedAt: string; answeredAt: string | null } | null;
}

/** Linha do tempo das rodadas da Cami com o cliente, desde a entrada, e o que ela prometeu. */
export async function loadConversationDetail(opportunityId: string): Promise<ConversationDetail | null> {
  const supabase = await createSupabaseServerForSync();
  const { data: conv, error } = await supabase
    .from("ai_seller_conversations")
    .select("contact_id, assigned_at")
    .eq("opportunity_id", opportunityId)
    .maybeSingle();
  if (error) throw new Error(`ai_seller_conversations: ${error.message}`);
  if (!conv) return null;

  const [{ data: runs, error: runsError }, { data: handoff, error: handoffError }] = await Promise.all([
    supabase
      .from("ai_seller_runs")
      .select("triggered_at, decision, escalation_reason, latency_ms, usage, tool_calls, client_message_at, replied_at, error")
      .eq("contact_id", conv.contact_id)
      .gte("triggered_at", conv.assigned_at)
      .neq("decision", "rodando")
      .order("triggered_at"),
    supabase
      .from("ai_seller_handoffs")
      .select("motivo, resumo, escalated_at, answered_at")
      .eq("contact_id", conv.contact_id)
      .gte("escalated_at", conv.assigned_at)
      .order("escalated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (runsError) throw new Error(`ai_seller_runs: ${runsError.message}`);
  if (handoffError) throw new Error(`ai_seller_handoffs: ${handoffError.message}`);

  const promessas: Promessa[] = [];
  const details: RunDetail[] = (runs ?? []).map((r) => {
    const calls = (Array.isArray(r.tool_calls) ? r.tool_calls : []) as Array<{ name: string; output: string }>;
    for (const call of calls) {
      if (call.name !== "atualizar_orcamento") continue;
      try {
        const out = JSON.parse(call.output) as Record<string, unknown>;
        if (out.erro) continue;
        promessas.push({
          at: r.triggered_at,
          pares: num(out.pares),
          unitario: num(out.valor_unitario),
          frete: num(out.frete),
          total: num(out.total),
        });
      } catch {
        // saída que não é JSON: não é cotação
      }
    }
    const usage = (r.usage ?? {}) as { input_tokens?: number; output_tokens?: number };
    return {
      triggeredAt: r.triggered_at,
      decision: r.decision,
      escalationReason: r.escalation_reason,
      latencyMs: r.latency_ms,
      tokensIn: usage.input_tokens ?? 0,
      tokensOut: usage.output_tokens ?? 0,
      responseMs:
        r.client_message_at && r.replied_at ? Date.parse(r.replied_at) - Date.parse(r.client_message_at) : null,
      tools: calls.map((c) => c.name),
      error: r.error,
    };
  });

  return {
    runs: details,
    promessas,
    passagem: handoff
      ? { motivo: handoff.motivo, resumo: handoff.resumo, escalatedAt: handoff.escalated_at, answeredAt: handoff.answered_at }
      : null,
  };
}

/** "Revisado": guarda os sinais de agora; a conversa volta à lista se surgir um sinal novo. */
export async function markReviewed(opportunityId: string): Promise<boolean> {
  const supabase = await createSupabaseServerForSync();
  const { data: row, error } = await supabase
    .from("ai_seller_conversations")
    .select("signals")
    .eq("opportunity_id", opportunityId)
    .maybeSingle();
  if (error) throw new Error(`ai_seller_conversations: ${error.message}`);
  if (!row) return false;
  const { error: updateError } = await supabase
    .from("ai_seller_conversations")
    .update({ reviewed_signals: row.signals ?? [], reviewed_at: new Date().toISOString() })
    .eq("opportunity_id", opportunityId);
  if (updateError) throw new Error(`ai_seller_conversations: ${updateError.message}`);
  return true;
}
