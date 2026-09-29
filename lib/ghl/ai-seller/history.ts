// Resumo do histórico de rodadas (ai_seller_runs) de um contato. Módulo puro.
import type { RunDecision } from "./types";

export interface RunHistoryRow {
  triggered_at: string;
  decision: RunDecision | string;
  escalation_reason: string | null;
  sent_message_ids: string[] | null;
}

export interface AiHistory {
  sentMessageIds: Set<string>;
  /** Para cada id enviado, o triggered_at da rodada que o enviou. */
  sentAtRunStart: Map<string, string>;
  sendsLastHour: number;
  /** Primeira rodada depois da última que encerrou uma sessão; null se não houver. */
  sessionStartedAt: string | null;
}

/** Rodada que tira o contato da IA: depois dela, uma volta à IA é sessão nova. */
function endsSession(row: RunHistoryRow): boolean {
  return (
    row.decision === "escalou" ||
    row.decision === "humano_assumiu" ||
    row.decision === "pulou:limite" ||
    (row.decision === "erro" && row.escalation_reason != null)
  );
}

/** `rows` em ordem cronológica (triggered_at crescente). */
export function summarizeRuns(rows: RunHistoryRow[], nowMs: number): AiHistory {
  // A linha "rodando" é a trava da rodada atual (o índice único impede outra).
  const runs = rows.filter((r) => r.decision !== "rodando");

  const hourAgo = nowMs - 60 * 60 * 1000;
  const sentMessageIds = new Set<string>();
  const sentAtRunStart = new Map<string, string>();
  let sendsLastHour = 0;
  let lastEndIndex = -1;
  runs.forEach((run, index) => {
    const ids = run.sent_message_ids ?? [];
    for (const id of ids) {
      sentMessageIds.add(id);
      sentAtRunStart.set(id, run.triggered_at);
    }
    if (Date.parse(run.triggered_at) >= hourAgo) sendsLastHour += ids.length;
    if (endsSession(run)) lastEndIndex = index;
  });

  return {
    sentMessageIds,
    sentAtRunStart,
    sendsLastHour,
    sessionStartedAt: runs[lastEndIndex + 1]?.triggered_at ?? null,
  };
}
