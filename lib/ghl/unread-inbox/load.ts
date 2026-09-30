// Leitura da fila de não lidas (aba Atendimentos Reais), usada pelas rotas de listar e atualizar.
import type { createClient } from "@/lib/supabase/server";
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
  refreshedAt: string;
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
    refreshedAt: r.refreshed_at,
  }));
  // Saiu da janela entre uma atualização e outra: some da fila na hora.
  return sortTriage(items.filter((i) => i.windowRemainingMs > 0));
}
