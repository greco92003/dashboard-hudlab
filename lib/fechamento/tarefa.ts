import "server-only";

import type { LinhaDoCard } from "./linha";
import { quandoTexto, rotuloDaSituacao, type Situacao } from "./regras";
import { atualizarTarefa, concluirTarefa, criarTarefa, lerTarefa } from "./ghl";

// A tarefa de follow-up de cada card no GHL acompanha o prazo do painel: a
// Schay vê e recebe o lembrete no próprio GHL. Uma tarefa aberta por card.

/**
 * Tarefas só na produção (ou com FECHAMENTO_TAREFAS=1): a prévia da Vercel e o
 * teste local leem o GHL e montam o painel sem mandar lembrete para a Schay.
 */
export function tarefasLigadas(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.FECHAMENTO_TAREFAS === "1";
}

function responsavel(l: LinhaDoCard): string | null {
  return l.assigned_to ?? process.env.AI_SELLER_ESCALATION_USER_ID ?? null;
}

function textoDaTarefa(l: LinhaDoCard, s: Situacao, nowMs: number) {
  const linhas = [
    rotuloDaSituacao(s, nowMs),
    `Etapa: ${l.stage_name}${l.qty_pares ? ` · ${l.qty_pares} pares` : ""}`,
    s.janelaFechaEm && s.janelaAberta ? `Janela de 24h fecha ${quandoTexto(s.janelaFechaEm, nowMs)}` : "Janela de 24h fechada: follow-up por modelo",
    l.combinado ? `Combinado: ${l.combinado}` : null,
    l.pendencia ? `Falta: ${l.pendencia}` : null,
    "Painel de fechamento do dashboard.",
  ].filter(Boolean);
  return { titulo: `Follow-up: ${l.contact_name ?? "cliente"}`, corpo: linhas.join("\n") };
}

/**
 * Deixa a tarefa do GHL com o prazo da situação. Muta e devolve a linha
 * (ghl_task_id, ghl_task_prazo e, se a Schay concluiu a tarefa no GHL,
 * contato_manual_em). Com a Cami atendendo, conclui a tarefa; com o cliente
 * esperando, não mexe (o vermelho do painel e a caixa do GHL já avisam).
 */
export async function sincronizarTarefa(l: LinhaDoCard, s: Situacao, nowMs: number): Promise<LinhaDoCard> {
  if (!tarefasLigadas()) return l;
  if (s.tipo === "cami") {
    if (l.ghl_task_id) {
      await concluirTarefa(l.contact_id, l.ghl_task_id).catch(() => undefined);
      l.ghl_task_id = null;
      l.ghl_task_prazo = null;
    }
    return l;
  }
  if (s.tipo === "responder" || s.prazoEm == null) return l;

  // Prazo vencido com tarefa aberta: se a Schay concluiu no GHL, conta como contato.
  if (l.ghl_task_id && l.ghl_task_prazo && Date.parse(l.ghl_task_prazo) <= nowMs) {
    const atual = await lerTarefa(l.contact_id, l.ghl_task_id);
    if (!atual || atual.completed) {
      if (atual?.completed) l.contato_manual_em = new Date(nowMs).toISOString();
      l.ghl_task_id = null;
      l.ghl_task_prazo = null;
      return l; // o novo prazo sai na próxima leitura, já contando o contato
    }
  }

  const mudou = !l.ghl_task_prazo || Math.abs(Date.parse(l.ghl_task_prazo) - s.prazoEm) > 60_000;
  if (l.ghl_task_id && !mudou) return l;
  const t = { ...textoDaTarefa(l, s, nowMs), prazoEm: s.prazoEm, responsavel: responsavel(l) };
  if (l.ghl_task_id) {
    await atualizarTarefa(l.contact_id, l.ghl_task_id, t);
  } else {
    l.ghl_task_id = await criarTarefa(l.contact_id, t);
  }
  l.ghl_task_prazo = new Date(s.prazoEm).toISOString();
  return l;
}

/** Card que saiu do painel (ganho, perdido, mudou de etapa): conclui a tarefa. */
export async function encerrarTarefa(l: LinhaDoCard): Promise<void> {
  if (!tarefasLigadas()) return;
  if (l.ghl_task_id) await concluirTarefa(l.contact_id, l.ghl_task_id);
}
