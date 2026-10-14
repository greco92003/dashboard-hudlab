// Alertas da CAMI Intelligence: passagem sem resposta e resumo do dia. Módulo puro.
import { businessMinutesBetween } from "./hours";
import type { Overview } from "./intel";
import type { Shift } from "./settings-shape";

export interface AlertSettings {
  /** Minutos úteis sem resposta até avisar quem recebe as passagens. */
  passagemSemRespostaMin: number;
  /** Minutos úteis sem resposta até avisar o owner. */
  ownerAposMin: number;
  /** Resumo diário para o owner (dias úteis, 18h30). */
  resumoDiario: boolean;
}

export const DEFAULT_ALERTS: AlertSettings = {
  passagemSemRespostaMin: 60,
  ownerAposMin: 120,
  resumoDiario: true,
};

export interface PendingHandoff {
  id: string;
  escalated_at: string;
  answered_at: string | null;
  alerted_at: string | null;
  owner_alerted_at: string | null;
}

/**
 * Quem avisar agora sobre cada passagem ainda sem resposta. Cada aviso sai uma
 * vez só (alerted_at / owner_alerted_at gravados depois do envio). Conta só
 * minutos de turno: de madrugada ninguém é avisado de atraso.
 */
export function handoffAlertsDue(
  handoffs: PendingHandoff[],
  now: number,
  alertas: AlertSettings,
  shifts?: ReadonlyArray<Shift>,
): Array<{ id: string; pessoa: boolean; owner: boolean; minutos: number }> {
  const due: Array<{ id: string; pessoa: boolean; owner: boolean; minutos: number }> = [];
  for (const h of handoffs) {
    if (h.answered_at) continue;
    const minutos = businessMinutesBetween(Date.parse(h.escalated_at), now, shifts);
    const pessoa = !h.alerted_at && minutos >= alertas.passagemSemRespostaMin;
    const owner = !h.owner_alerted_at && minutos >= alertas.ownerAposMin;
    if (pessoa || owner) due.push({ id: h.id, pessoa, owner, minutos: Math.round(minutos) });
  }
  return due;
}

export function fmtMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

/**
 * Texto do resumo do dia; null quando a Cami não fez nada (não manda push vazio).
 */
export function buildDailySummary(input: {
  overview: Overview;
  paraRevisar: number;
  escalationName: string;
}): { title: string; message: string } | null {
  const o = input.overview;
  const pagamento = o.passagens.porMotivo.find((p) => p.motivo === "pronto_para_pagar")?.n ?? 0;
  const atividade = o.assumidos + o.custo.rodadas + o.passagens.total + input.paraRevisar;
  if (atividade === 0) return null;

  const partes = [
    `${o.assumidos} ${o.assumidos === 1 ? "cliente novo" : "clientes novos"}`,
    `${o.passagens.total} para ${input.escalationName}${pagamento ? ` (${pagamento} pronto${pagamento === 1 ? "" : "s"} para pagar)` : ""}`,
  ];
  if (o.vendas.n) partes.push(`${o.vendas.n} ${o.vendas.n === 1 ? "venda" : "vendas"}`);
  if (o.tempoResposta.medianaSeg != null) partes.push(`resposta em ${Math.round(o.tempoResposta.medianaSeg)} s`);
  const revisar = input.paraRevisar
    ? ` ${input.paraRevisar} ${input.paraRevisar === 1 ? "conversa" : "conversas"} para revisar.`
    : "";
  return { title: "Cami hoje", message: `${partes.join(" · ")}.${revisar}` };
}
