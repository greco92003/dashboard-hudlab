// Leitura da fila de não lidas (aba Atendimentos Reais), usada pelas rotas de listar e atualizar.
import { summarizeRuns, type RunHistoryRow } from "@/lib/ghl/ai-seller/history";
import type { createClient } from "@/lib/supabase/server";
import { fetchAllSupabaseRows } from "@/lib/supabase-pagination";
import { sortTriage, windowRemainingMs, type TriageCategory } from "./triage";

export interface UnreadInboxItem {
  conversationId: string;
  contactId: string;
  contactName: string | null;
  phone: string | null;
  opportunityId: string | null;
  stageName: string | null;
  vendedor: string | null;
  qtyPares: number | null;
  monetaryValue: number | null;
  unreadCount: number;
  lastInboundAt: string;
  lastMessageBody: string | null;
  /** Quanto falta para a janela de 24h fechar; a fila só tem quem ainda está nela. */
  windowRemainingMs: number;
  category: TriageCategory | null;
  reason: string | null;
  subject: string | null;
  classifyError: string | null;
  insight: unknown;
  insightAt: string | null;
  /** Chegou mensagem depois do insight: vale gerar de novo. */
  insightOutdated: boolean;
  /** A IA está com o cliente: se alguém do time responder, ela sai da conversa. */
  withAi: boolean;
  refreshedAt: string;
}

/** Contatos com sessão aberta da IA (mesma regra que a IA usa para saber se ainda é dela). */
async function contactsWithAi(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contactIds: string[],
  now: number,
): Promise<Set<string>> {
  if (contactIds.length === 0) return new Set();
  const rows = await fetchAllSupabaseRows<RunHistoryRow & { contact_id: string }>(
    (from, to) =>
      supabase
        .from("ai_seller_runs")
        .select("contact_id, triggered_at, decision, escalation_reason, sent_message_ids")
        .in("contact_id", contactIds)
        .order("triggered_at", { ascending: true })
        .range(from, to),
    "ai_seller_runs",
  );
  const byContact = new Map<string, RunHistoryRow[]>();
  for (const row of rows) {
    byContact.set(row.contact_id, [...(byContact.get(row.contact_id) ?? []), row]);
  }
  return new Set(
    [...byContact].filter(([, runs]) => summarizeRuns(runs, now).sessionStartedAt != null).map(([id]) => id),
  );
}

export async function loadUnreadInbox(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<UnreadInboxItem[]> {
  const { data, error } = await supabase
    .from("ghl_unread_triage")
    .select("*")
    .eq("is_unread", true);
  if (error) throw new Error(`ghl_unread_triage: ${error.message}`);

  const now = Date.now();
  const withAi = await contactsWithAi(
    supabase,
    [...new Set((data ?? []).map((r) => r.contact_id as string))],
    now,
  );
  const items: UnreadInboxItem[] = (data ?? []).map((r) => ({
    conversationId: r.conversation_id,
    contactId: r.contact_id,
    contactName: r.contact_name,
    phone: r.phone,
    opportunityId: r.opportunity_id,
    stageName: r.stage_name,
    vendedor: r.vendedor,
    qtyPares: r.qty_pares,
    monetaryValue: r.monetary_value == null ? null : Number(r.monetary_value),
    unreadCount: r.unread_count,
    lastInboundAt: r.last_inbound_at,
    lastMessageBody: r.last_message_body,
    windowRemainingMs: windowRemainingMs(Date.parse(r.last_inbound_at), now),
    category: r.category,
    reason: r.reason,
    subject: r.subject,
    classifyError: r.classify_error,
    insight: r.insight,
    insightAt: r.insight_at,
    insightOutdated: !!r.insight && r.insight_message_id !== r.last_message_id,
    withAi: withAi.has(r.contact_id),
    refreshedAt: r.refreshed_at,
  }));
  // Saiu da janela entre uma atualização e outra: some da fila na hora.
  return sortTriage(items.filter((i) => i.windowRemainingMs > 0));
}
