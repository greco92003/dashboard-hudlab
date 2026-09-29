import "server-only";

import { createSupabaseServerForSync } from "@/lib/supabase/server";
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
  const { data, error } = await supabase
    .from("ai_seller_runs")
    .select("triggered_at, sent_message_ids")
    .eq("contact_id", contactId)
    .order("triggered_at", { ascending: true })
    .limit(1000);
  if (error) throw new Error(`ai_seller_runs: ${error.message}`);

  const rows = (data ?? []) as Array<{
    triggered_at: string;
    sent_message_ids: string[] | null;
  }>;
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
