import type { NegotiationMessage } from "@/lib/ghl/negotiation-conversations";
import { MAX_AI_REPLIES_PER_HOUR, MAX_AI_SENDS_PER_HOUR } from "./config";

export interface DecideInput {
  now: number;
  hasAiTag: boolean;
  /** Conversa em ordem cronológica, como getNegotiationTranscript devolve. */
  messages: NegotiationMessage[];
  aiSentMessageIds: ReadonlySet<string>;
  /** Para cada id enviado pela IA, o triggered_at da rodada que o enviou. */
  aiSentAtRunStart: ReadonlyMap<string, string>;
  aiSendsLastHour: number;
  /** Rodadas da última hora que enviaram ao menos uma mensagem. */
  aiRepliesLastHour: number;
  /** Primeira rodada da sessão atual da IA com o contato; null se não houver. */
  aiSessionStartedAt: string | null;
}

export type DecideResult =
  | { kind: "run" }
  | {
      kind: "skip";
      decision: "pulou:sem_tag" | "pulou:ja_respondido";
    }
  | { kind: "human_took_over" }
  | { kind: "limit" };

/**
 * Humano = saída digitada por alguém do time. Verificado ao vivo em 29/09: o
 * GHL devolve mensagem enviada pela API com source "app" e userId vazio, e a
 * do vendedor com userId preenchido. Saída sem userId, que não é automação nem
 * da IA, é de origem desconhecida e não cala a IA.
 */
export function isHumanSellerMessage(
  message: NegotiationMessage,
  aiSentMessageIds: ReadonlySet<string>,
  cutoffMs: number,
): boolean {
  return (
    message.direction === "outbound" &&
    message.userId != null &&
    !message.isAutomated &&
    !aiSentMessageIds.has(message.id) &&
    Date.parse(message.dateAdded) >= cutoffMs
  );
}

export function decideRun(input: DecideInput): DecideResult {
  if (!input.hasAiTag) return { kind: "skip", decision: "pulou:sem_tag" };

  // Sem rodada anterior na sessão, o corte é "agora": nada do histórico conta
  // como humano assumindo (ver "Ajustes em relação ao spec", item 3, no plano).
  const cutoffMs = input.aiSessionStartedAt ? Date.parse(input.aiSessionStartedAt) : input.now;
  if (
    input.messages.some((m) =>
      isHumanSellerMessage(m, input.aiSentMessageIds, cutoffMs),
    )
  ) {
    return { kind: "human_took_over" };
  }

  const lastInbound = [...input.messages]
    .reverse()
    .find((m) => m.direction === "inbound");
  if (!lastInbound) return { kind: "skip", decision: "pulou:ja_respondido" };

  // Sem espera aqui: o agrupamento é a espera de 90s do workflow do GHL, que
  // ignora nova entrada do contato enquanto ele está inscrito. A mensagem que
  // chegou durante a espera não tem chamada própria; esta chamada a responde.
  const lastInboundMs = Date.parse(lastInbound.dateAdded);

  // Só conta como resposta a fala de uma rodada que começou depois da última
  // mensagem do cliente: a rodada que já estava rodando quando ela chegou não
  // a viu, mesmo que tenha enviado depois.
  const alreadyAnswered = input.messages.some((m) => {
    const runStart = input.aiSentAtRunStart.get(m.id);
    return runStart != null && Date.parse(runStart) > lastInboundMs;
  });
  if (alreadyAnswered) return { kind: "skip", decision: "pulou:ja_respondido" };

  // Conta respostas, não balões: cada resposta sai em 2-3 balões.
  if (
    input.aiRepliesLastHour >= MAX_AI_REPLIES_PER_HOUR ||
    input.aiSendsLastHour >= MAX_AI_SENDS_PER_HOUR
  ) {
    return { kind: "limit" };
  }

  return { kind: "run" };
}

/**
 * Rechecagem logo antes do envio: há mensagem do cliente nas mais recentes da
 * conversa que não estava no retrato lido no início da rodada?
 */
export function hasUnseenInbound(
  recent: ReadonlyArray<{ id: string; direction: "inbound" | "outbound" }>,
  seenMessageIds: ReadonlySet<string>,
): boolean {
  return recent.some((m) => m.direction === "inbound" && !seenMessageIds.has(m.id));
}

/**
 * Rodada longa (>90s) engole o webhook da mensagem nova (pulou:em_andamento),
 * que não volta. Se a rodada terminou sem responder o que o cliente escreveu
 * depois do retrato, ninguém mais responde: escalar.
 */
export function mustEscalateSwallowedCall(input: {
  decision: string;
  swallowedCall: boolean;
  hasUnseenInbound: boolean;
}): boolean {
  if (!input.swallowedCall) return false;
  if (input.decision === "pulou:mensagem_nova") return true;
  return input.decision === "nao_respondeu" && input.hasUnseenInbound;
}
