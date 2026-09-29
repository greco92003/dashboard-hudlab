import type { NegotiationMessage } from "@/lib/ghl/negotiation-conversations";
import { DEBOUNCE_MS, MAX_AI_SENDS_PER_HOUR } from "./config";

export interface DecideInput {
  now: number;
  hasAiTag: boolean;
  /** Conversa em ordem cronológica, como getNegotiationTranscript devolve. */
  messages: NegotiationMessage[];
  aiSentMessageIds: ReadonlySet<string>;
  aiSendsLastHour: number;
  /** Primeiro acionamento registrado para o contato; null na primeira vez. */
  aiFirstRunAt: string | null;
}

export type DecideResult =
  | { kind: "run" }
  | {
      kind: "skip";
      decision: "pulou:sem_tag" | "pulou:agrupando" | "pulou:ja_respondido";
    }
  | { kind: "human_took_over" }
  | { kind: "limit" };

export function isHumanSellerMessage(
  message: NegotiationMessage,
  aiSentMessageIds: ReadonlySet<string>,
  cutoffMs: number,
): boolean {
  return (
    message.direction === "outbound" &&
    !message.isAutomated &&
    !aiSentMessageIds.has(message.id) &&
    Date.parse(message.dateAdded) >= cutoffMs
  );
}

export function decideRun(input: DecideInput): DecideResult {
  if (!input.hasAiTag) return { kind: "skip", decision: "pulou:sem_tag" };

  // Sem rodada anterior, o corte é "agora": nada do histórico conta como
  // humano assumindo (ver "Ajustes em relação ao spec", item 3, no plano).
  const cutoffMs = input.aiFirstRunAt ? Date.parse(input.aiFirstRunAt) : input.now;
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

  const lastInboundMs = Date.parse(lastInbound.dateAdded);
  if (input.now - lastInboundMs < DEBOUNCE_MS) {
    return { kind: "skip", decision: "pulou:agrupando" };
  }

  const alreadyAnswered = input.messages.some(
    (m) =>
      input.aiSentMessageIds.has(m.id) && Date.parse(m.dateAdded) > lastInboundMs,
  );
  if (alreadyAnswered) return { kind: "skip", decision: "pulou:ja_respondido" };

  if (input.aiSendsLastHour >= MAX_AI_SENDS_PER_HOUR) return { kind: "limit" };

  return { kind: "run" };
}
