import "server-only";

import { createSupabaseServerForSync } from "@/lib/supabase/server";
import { fetchAllSupabaseRows } from "@/lib/supabase-pagination";
import type { EscalationReason, RunDecision } from "./types";

export interface AiHistory {
  sentMessageIds: Set<string>;
  sendsLastHour: number;
  firstRunAt: string | null;
}

export async function loadAiHistory(
  contactId: string,
  nowMs: number,
): Promise<AiHistory> {
  const supabase = await createSupabaseServerForSync();

  const rows = await fetchAllSupabaseRows<{
    triggered_at: string;
    sent_message_ids: string[] | null;
  }>((from, to) => {
    return supabase
      .from("ai_seller_runs")
      .select("triggered_at, sent_message_ids")
      .eq("contact_id", contactId)
      .order("triggered_at", { ascending: true })
      .range(from, to);
  }, "ai_seller_runs");

  const hourAgo = nowMs - 60 * 60 * 1000;
  const sentMessageIds = new Set<string>();
  let sendsLastHour = 0;
  for (const row of rows) {
    const ids = row.sent_message_ids ?? [];
    for (const id of ids) sentMessageIds.add(id);
    if (Date.parse(row.triggered_at) >= hourAgo) sendsLastHour += ids.length;
  }
  return { sentMessageIds, sendsLastHour, firstRunAt: rows[0]?.triggered_at ?? null };
}

export interface AiSellerRunInsert {
  contact_id: string;
  opportunity_id: string | null;
  triggered_at: string;
  decision: RunDecision;
  escalation_reason: EscalationReason | null;
  tool_calls: unknown;
  sent_message_ids: string[];
  model: string | null;
  usage: unknown;
  latency_ms: number;
  error: string | null;
}

/**
 * Falhar aqui é grave: sem os ids enviados, a próxima rodada não sabe que a
 * IA já respondeu. Por isso lança — a rota devolve 500 e o erro aparece no
 * log do Vercel.
 */
export async function insertRun(row: AiSellerRunInsert): Promise<void> {
  const supabase = await createSupabaseServerForSync();
  const { error } = await supabase.from("ai_seller_runs").insert(row);
  if (error) throw new Error(`ai_seller_runs insert: ${error.message}`);
}
