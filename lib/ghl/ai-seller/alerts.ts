// Alertas da CAMI Intelligence: passagem sem resposta e resumo do dia. Módulo puro.
import { businessMinutesBetween, escalationAvailability } from "./hours";
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
  /** Aviso "cliente passado para você"; null = ainda não saiu (passagem fora do turno). */
  notified_at: string | null;
  alerted_at: string | null;
  owner_alerted_at: string | null;
}

/**
 * O que mandar agora sobre cada passagem ainda sem resposta:
 * - aviso: "cliente passado para você", na hora da passagem (a rodada da Cami
 *   manda) ou, fora do turno, no primeiro minuto do turno seguinte (aqui);
 * - pessoa: lembrete a quem recebe, depois de passagemSemRespostaMin úteis;
 * - owner: aviso ao dono, depois de ownerAposMin úteis.
 * Cada um sai uma vez só (notified_at / alerted_at / owner_alerted_at). Conta
 * só minutos de turno: de madrugada ninguém é avisado.
 */
export function handoffAlertsDue(
  handoffs: PendingHandoff[],
  now: number,
  alertas: AlertSettings,
  shifts?: ReadonlyArray<Shift>,
): Array<{ id: string; aviso: boolean; pessoa: boolean; owner: boolean; minutos: number }> {
  const due: Array<{ id: string; aviso: boolean; pessoa: boolean; owner: boolean; minutos: number }> = [];
  const noTurno = escalationAvailability(now, shifts).available;
  for (const h of handoffs) {
    if (h.answered_at) continue;
    const minutos = businessMinutesBetween(Date.parse(h.escalated_at), now, shifts);
    const aviso = !h.notified_at && noTurno;
    const pessoa = !h.alerted_at && minutos >= alertas.passagemSemRespostaMin;
    const owner = !h.owner_alerted_at && minutos >= alertas.ownerAposMin;
    if (aviso || pessoa || owner) due.push({ id: h.id, aviso, pessoa, owner, minutos: Math.round(minutos) });
  }
  return due;
}

/** Texto do aviso de passagem para quem recebe o cliente. */
export function handoffNoticeText(input: {
  nome: string | null;
  motivo: string;
  resumo: string | null;
}): { title: string; message: string } {
  const nome = input.nome?.trim() || "um cliente";
  const resumo = (input.resumo ?? "").replace(/\s+/g, " ").trim();
  const curto = resumo.length > 140 ? `${resumo.slice(0, 139).trimEnd()}…` : resumo;
  return {
    title: "Cliente passado para você",
    message: `A Cami passou ${nome} para você (${input.motivo}).${curto ? ` ${curto}` : ""}`,
  };
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
