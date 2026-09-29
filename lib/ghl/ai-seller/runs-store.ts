import "server-only";

import { createSupabaseServerForSync } from "@/lib/supabase/server";
import { fetchAllSupabaseRows } from "@/lib/supabase-pagination";
import { summarizeRuns, type AiHistory, type RunHistoryRow } from "./history";
import type { EscalationReason, RunDecision } from "./types";

export type { AiHistory } from "./history";

/** Trava mais velha que isso é de uma rodada que morreu sem gravar o fim. */
const LOCK_EXPIRY_MS = 150_000;

export async function loadAiHistory(
  contactId: string,
  nowMs: number,
): Promise<AiHistory> {
  const supabase = await createSupabaseServerForSync();

  const rows = await fetchAllSupabaseRows<RunHistoryRow>((from, to) => {
    return supabase
      .from("ai_seller_runs")
      .select("triggered_at, decision, escalation_reason, sent_message_ids")
      .eq("contact_id", contactId)
      .order("triggered_at", { ascending: true })
      .range(from, to);
  }, "ai_seller_runs");

  return summarizeRuns(rows, nowMs);
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

/** Lança em falha; quem chama decide se loga ou repete. */
export async function insertRun(row: AiSellerRunInsert): Promise<void> {
  const supabase = await createSupabaseServerForSync();
  const { error } = await supabase.from("ai_seller_runs").insert(row);
  if (error) throw new Error(`ai_seller_runs insert: ${error.message}`);
}

/**
 * Trava por contato: a linha `decision = 'rodando'` é única por contato
 * (índice parcial ai_seller_runs_um_rodando_por_contato). Antes de inserir,
 * libera trava vencida de rodada que morreu sem gravar o fim.
 * Devolve o id da linha, ou null se outra rodada do contato está em andamento.
 */
export async function acquireRunLock(
  contactId: string,
  startedAtMs: number,
): Promise<string | null> {
  const supabase = await createSupabaseServerForSync();

  const { error: releaseError } = await supabase
    .from("ai_seller_runs")
    .update({ decision: "erro", error: "trava expirada" })
    .eq("contact_id", contactId)
    .eq("decision", "rodando")
    .lt("triggered_at", new Date(startedAtMs - LOCK_EXPIRY_MS).toISOString());
  if (releaseError) throw new Error(`ai_seller_runs trava vencida: ${releaseError.message}`);

  const { data, error } = await supabase
    .from("ai_seller_runs")
    .insert({
      contact_id: contactId,
      triggered_at: new Date(startedAtMs).toISOString(),
      decision: "rodando" satisfies RunDecision,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return null;
    throw new Error(`ai_seller_runs trava: ${error.message}`);
  }
  return (data as { id: string }).id;
}

/** Gravação final: substitui a linha da trava pelo resultado da rodada. */
export async function finishRun(
  runId: string,
  row: Omit<AiSellerRunInsert, "contact_id" | "triggered_at">,
): Promise<void> {
  const supabase = await createSupabaseServerForSync();
  const { data, error } = await supabase
    .from("ai_seller_runs")
    .update(row)
    .eq("id", runId)
    .select("id");
  if (error) throw new Error(`ai_seller_runs update: ${error.message}`);
  if (!data || data.length === 0) throw new Error(`ai_seller_runs update: linha ${runId} não encontrada`);
}

/** Houve escalonamento registrado para o contato desde `sinceMs`? */
export async function hasRecentEscalation(
  contactId: string,
  sinceMs: number,
): Promise<boolean> {
  const supabase = await createSupabaseServerForSync();
  const { data, error } = await supabase
    .from("ai_seller_runs")
    .select("id")
    .eq("contact_id", contactId)
    .not("escalation_reason", "is", null)
    .gte("triggered_at", new Date(sinceMs).toISOString())
    .limit(1);
  if (error) throw new Error(`ai_seller_runs escalonamento recente: ${error.message}`);
  return (data ?? []).length > 0;
}
