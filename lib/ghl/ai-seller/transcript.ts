// O que da conversa vai para a Cami. Módulo puro.
import type { NegotiationMessage } from "@/lib/ghl/negotiation-conversations";
import { isSampleDelivery } from "@/lib/ghl/unread-inbox/triage";

/** Orçamento e formas de pagamento que o robô mostrou ao cliente: texto curto que a Cami precisa conhecer. */
const KEEP_AUTOMATED = /R\$|formas de pagamento/i;

/**
 * Tira as mensagens automáticas (robô de atendimento, campanhas) anteriores à
 * última entrega da Amostra Digital: textos longos e fotos de exemplo que
 * pesavam a maior parte dos tokens e não mudam a resposta. Ficam o orçamento
 * e as formas de pagamento do robô, tudo do cliente e do time, e a conversa
 * inteira a partir da entrega. Sem entrega na conversa, nada sai.
 */
export function trimForSeller(messages: NegotiationMessage[]): {
  messages: NegotiationMessage[];
  omittedAutomated: number;
} {
  let deliveryIndex = -1;
  messages.forEach((m, index) => {
    if (isSampleDelivery(m)) deliveryIndex = index;
  });
  if (deliveryIndex < 0) return { messages, omittedAutomated: 0 };

  const kept = messages.filter(
    (m, index) =>
      index >= deliveryIndex ||
      !(m.direction === "outbound" && m.isAutomated) ||
      KEEP_AUTOMATED.test(m.body),
  );
  return { messages: kept, omittedAutomated: messages.length - kept.length };
}
