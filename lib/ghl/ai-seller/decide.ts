import type { NegotiationMessage } from "@/lib/ghl/negotiation-conversations";
import {
  ASSIGN_MAX_PARES,
  ASSIGN_MIN_PARES,
  GHL_ATENDIMENTO_PIPELINE_ID,
  HUMAN_RECENT_MS,
  MAX_AI_REPLIES_PER_HOUR,
  MAX_AI_SENDS_PER_HOUR,
} from "./config";

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

  // Sem espera aqui: a rodada já esperou o cliente parar de escrever
  // (CLIENT_PAUSE_MS, em run.ts) antes de chegar à decisão.
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

export type AssignDecision =
  | { assign: true }
  | {
      assign: false;
      motivo:
        | "ja_com_a_ia"
        | "ja_passou_para_humano"
        | "sem_oportunidade"
        | "fora_do_atendimento"
        | "fora_da_faixa_de_pares"
        | "time_ja_conversando";
    };

/**
 * A Cami assume o cliente quando a amostra é entregue? Só pedido na faixa de
 * pares, no pipeline Atendimento, que ninguém do time esteja conduzindo e que
 * nunca tenha sido passado da IA para humano (cliente que voltou fica com quem
 * já o conhece).
 */
export function decideAssignment(input: {
  now: number;
  tags: readonly string[];
  aiTag: string;
  escalatedTag: string;
  pipelineId: string | null;
  pares: number | null;
  messages: NegotiationMessage[];
}): AssignDecision {
  if (input.tags.includes(input.aiTag)) return { assign: false, motivo: "ja_com_a_ia" };
  if (input.tags.includes(input.escalatedTag)) return { assign: false, motivo: "ja_passou_para_humano" };
  if (input.pipelineId == null) return { assign: false, motivo: "sem_oportunidade" };
  if (input.pipelineId !== GHL_ATENDIMENTO_PIPELINE_ID) return { assign: false, motivo: "fora_do_atendimento" };
  if (input.pares == null || input.pares < ASSIGN_MIN_PARES || input.pares > ASSIGN_MAX_PARES) {
    return { assign: false, motivo: "fora_da_faixa_de_pares" };
  }
  const humanTalking = input.messages.some((m) =>
    isHumanSellerMessage(m, new Set(), input.now - HUMAN_RECENT_MS),
  );
  if (humanTalking) return { assign: false, motivo: "time_ja_conversando" };
  return { assign: true };
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
 * Chamada que esperou a rodada anterior além de LOCK_WAIT_MS desiste
 * (pulou:em_andamento) e não volta. Se a rodada terminou sem responder o que o cliente escreveu
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
