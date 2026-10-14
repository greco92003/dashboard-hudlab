// Números da CAMI Intelligence: resumo de cada conversa da Cami e a visão
// geral do período. Módulo puro (o cron e as rotas buscam os dados).
import { businessMinutesBetween } from "./hours";
import type { Shift } from "./settings-shape";

export type Situacao =
  | "atendendo"
  | "esperando_cliente"
  | "passou"
  | "humano_assumiu"
  | "ganhou"
  | "perdeu";

export type Signal =
  | "sumiu"
  | "pediu_pessoa_ou_reclamou"
  | "passagem_sem_resposta"
  | "resposta_lenta"
  | "falha";

export const SUMIU_MS = 24 * 60 * 60 * 1000;
export const RESPOSTA_LENTA_MS = 2 * 60 * 1000;
export const PASSAGEM_SEM_RESPOSTA_MIN = 60;

export interface IntelRun {
  triggered_at: string;
  decision: string;
  escalation_reason: string | null;
  sent_message_ids: string[] | null;
  usage: { input_tokens?: number; output_tokens?: number } | null;
  client_message_at: string | null;
  replied_at: string | null;
}

export interface IntelHandoff {
  motivo: string;
  escalated_at: string;
  answered_at: string | null;
}

export interface OppSnapshot {
  /** open / won / lost / abandoned, como o GHL devolve. */
  status: string | null;
  won: boolean;
  /** Posição da etapa atual no pipeline Atendimento; null fora dele. */
  stageRank: number | null;
}

export interface FunnelRanks {
  negociacao: number;
  prioridade: number;
}

export interface ConversationSummary {
  situacao: Situacao;
  clientReplied: boolean;
  reachedNegociacao: boolean;
  reachedPrioridade: boolean;
  lastClientAt: string | null;
  lastCamiAt: string | null;
  replies: number;
  tokensIn: number;
  tokensOut: number;
  maxResponseMs: number | null;
  signals: Signal[];
}

const maxIso = (values: Array<string | null>): string | null =>
  values.reduce<string | null>((best, v) => (v && (!best || v > best) ? v : best), null);

const LOST = new Set(["lost", "abandoned"]);
const ASKED_PERSON = new Set(["cliente_pediu_pessoa", "reclamacao"]);

/**
 * Situação e sinais de uma conversa da Cami. `runs` e `handoff` são só os de
 * depois da entrada (o webhook roda a cada mensagem do cliente, então haver
 * rodada = o cliente escreveu).
 */
export function summarizeConversation(input: {
  runs: IntelRun[];
  handoff: IntelHandoff | null;
  opp: OppSnapshot;
  ranks: FunnelRanks;
  now: number;
  shifts?: ReadonlyArray<Shift>;
}): ConversationSummary {
  const { runs, handoff, opp, ranks, now } = input;
  const lastClientAt = maxIso(runs.map((r) => r.client_message_at));
  const lastCamiAt = maxIso(runs.map((r) => r.replied_at));
  const replies = runs.filter((r) => (r.sent_message_ids ?? []).length > 0).length;
  const tokensIn = runs.reduce((sum, r) => sum + (r.usage?.input_tokens ?? 0), 0);
  const tokensOut = runs.reduce((sum, r) => sum + (r.usage?.output_tokens ?? 0), 0);
  const responseTimes = runs
    .filter((r) => r.client_message_at && r.replied_at)
    .map((r) => Date.parse(r.replied_at as string) - Date.parse(r.client_message_at as string))
    .filter((ms) => ms >= 0);
  const maxResponseMs = responseTimes.length ? Math.max(...responseTimes) : null;

  let situacao: Situacao;
  if (opp.won) situacao = "ganhou";
  else if (opp.status && LOST.has(opp.status)) situacao = "perdeu";
  else if (runs.some((r) => r.decision === "humano_assumiu")) situacao = "humano_assumiu";
  else if (handoff) situacao = "passou";
  else if (lastCamiAt && (!lastClientAt || lastCamiAt > lastClientAt)) situacao = "esperando_cliente";
  else situacao = "atendendo";

  const signals: Signal[] = [];
  if (situacao === "esperando_cliente" && lastCamiAt && now - Date.parse(lastCamiAt) > SUMIU_MS) {
    signals.push("sumiu");
  }
  if (handoff && ASKED_PERSON.has(handoff.motivo)) signals.push("pediu_pessoa_ou_reclamou");
  if (
    situacao === "passou" &&
    handoff &&
    !handoff.answered_at &&
    businessMinutesBetween(Date.parse(handoff.escalated_at), now, input.shifts) > PASSAGEM_SEM_RESPOSTA_MIN
  ) {
    signals.push("passagem_sem_resposta");
  }
  if (maxResponseMs != null && maxResponseMs > RESPOSTA_LENTA_MS) signals.push("resposta_lenta");
  if (
    runs.some(
      (r) => r.decision === "erro" || r.decision === "pulou:limite" || r.escalation_reason === "falha_tecnica",
    )
  ) {
    signals.push("falha");
  }

  const paid = handoff?.motivo === "pronto_para_pagar";
  const rank = opp.stageRank;
  return {
    situacao,
    clientReplied: runs.length > 0,
    reachedNegociacao: opp.won || paid || (rank != null && rank >= ranks.negociacao),
    reachedPrioridade: opp.won || paid || (rank != null && rank >= ranks.prioridade),
    lastClientAt,
    lastCamiAt,
    replies,
    tokensIn,
    tokensOut,
    maxResponseMs,
    signals,
  };
}

/** Na lista "Para revisar" enquanto houver sinal que o owner ainda não marcou como revisado. */
export function needsReview(signals: readonly string[], reviewed: readonly string[]): boolean {
  return signals.some((s) => !reviewed.includes(s));
}

// ---------------------------------------------------------------------------
// Visão geral do período
// ---------------------------------------------------------------------------

export type Periodo = "hoje" | "7d" | "30d" | "tudo";
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Início do período em ms; null = desde sempre. "hoje" começa à meia-noite de Brasília. */
export function periodStart(periodo: Periodo, now: number): number | null {
  if (periodo === "tudo") return null;
  if (periodo === "hoje") return Math.floor((now - BRT_OFFSET_MS) / DAY_MS) * DAY_MS + BRT_OFFSET_MS;
  return now - (periodo === "7d" ? 7 : 30) * DAY_MS;
}

export interface OverviewConversation {
  assigned_at: string;
  situacao: string;
  client_replied: boolean;
  reached_negociacao: boolean;
  reached_prioridade: boolean;
  handoff_motivo: string | null;
  monetary_value: number | null;
  signals: string[];
}

export interface Custo {
  entradaUsdPorMilhao: number;
  saidaUsdPorMilhao: number;
  dolar: number;
}

export interface Ratio {
  n: number;
  /** null quando não há base (aparece "—"). */
  pct: number | null;
}

export interface Overview {
  assumidos: number;
  foraDaCami: Array<{ motivo: string; n: number }>;
  responderam: Ratio;
  tempoResposta: { medianaSeg: number | null; piorSeg: number | null; n: number };
  passagens: { total: number; porMotivo: Array<{ motivo: string; n: number }> };
  pagamento: Ratio;
  sumiram: Ratio;
  vendas: { n: number; valor: number };
  custo: { reais: number; porVendaReais: number | null; tokensIn: number; tokensOut: number; rodadas: number };
  funil: Array<{ etapa: string; n: number; pct: number | null }>;
}

const ratio = (n: number, base: number): Ratio => ({ n, pct: base > 0 ? (n / base) * 100 : null });

function countBy<T>(items: T[], key: (item: T) => string): Array<{ motivo: string; n: number }> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return [...counts].map(([motivo, n]) => ({ motivo, n })).sort((a, b) => b.n - a.n);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Números do período. Conversas e funil são uma coorte: os clientes que a
 * Cami assumiu no período, olhados hoje. Rodadas e passagens contam pela data
 * em que aconteceram.
 */
export function computeOverview(input: {
  fromMs: number | null;
  assignments: Array<{ created_at: string; decisao: string }>;
  conversations: OverviewConversation[];
  runs: Array<Pick<IntelRun, "triggered_at" | "usage" | "client_message_at" | "replied_at">>;
  handoffs: Array<{ motivo: string; escalated_at: string }>;
  custo: Custo;
}): Overview {
  const inPeriod = (iso: string) => input.fromMs == null || Date.parse(iso) >= input.fromMs;
  const assignments = input.assignments.filter((a) => inPeriod(a.created_at));
  const cohort = input.conversations.filter((c) => inPeriod(c.assigned_at));
  const runs = input.runs.filter((r) => inPeriod(r.triggered_at));
  const handoffs = input.handoffs.filter((h) => inPeriod(h.escalated_at));

  const assumidos = cohort.length;
  const responderam = cohort.filter((c) => c.client_replied).length;
  const negociacao = cohort.filter((c) => c.reached_negociacao).length;
  const prioridade = cohort.filter((c) => c.reached_prioridade).length;
  const pagamento = cohort.filter((c) => c.handoff_motivo === "pronto_para_pagar" || c.situacao === "ganhou").length;
  const ganhas = cohort.filter((c) => c.situacao === "ganhou");
  const sumiram = cohort.filter((c) => c.signals.includes("sumiu")).length;

  const responseSeconds = runs
    .filter((r) => r.client_message_at && r.replied_at)
    .map((r) => (Date.parse(r.replied_at as string) - Date.parse(r.client_message_at as string)) / 1000)
    .filter((s) => s >= 0);

  const tokensIn = runs.reduce((sum, r) => sum + (r.usage?.input_tokens ?? 0), 0);
  const tokensOut = runs.reduce((sum, r) => sum + (r.usage?.output_tokens ?? 0), 0);
  const reais =
    ((tokensIn / 1e6) * input.custo.entradaUsdPorMilhao + (tokensOut / 1e6) * input.custo.saidaUsdPorMilhao) *
    input.custo.dolar;
  const valorVendas = ganhas.reduce((sum, c) => sum + (c.monetary_value ?? 0), 0);

  const funnelSteps: Array<[string, number]> = [
    ["Assumidos", assumidos],
    ["Responderam", responderam],
    ["Negociação", negociacao],
    ["Prioridade de Fechamento", prioridade],
    ["Passou para o pagamento", pagamento],
    ["Ganhou", ganhas.length],
  ];

  return {
    assumidos,
    foraDaCami: countBy(
      assignments.filter((a) => a.decisao !== "assumiu"),
      (a) => a.decisao,
    ),
    responderam: ratio(responderam, assumidos),
    tempoResposta: {
      medianaSeg: median(responseSeconds),
      piorSeg: responseSeconds.length ? Math.max(...responseSeconds) : null,
      n: responseSeconds.length,
    },
    passagens: { total: handoffs.length, porMotivo: countBy(handoffs, (h) => h.motivo) },
    pagamento: ratio(pagamento, assumidos),
    sumiram: ratio(sumiram, assumidos),
    vendas: { n: ganhas.length, valor: valorVendas },
    custo: {
      reais,
      porVendaReais: ganhas.length ? reais / ganhas.length : null,
      tokensIn,
      tokensOut,
      rodadas: runs.length,
    },
    funil: funnelSteps.map(([etapa, n]) => ({ etapa, n, pct: assumidos > 0 ? (n / assumidos) * 100 : null })),
  };
}
