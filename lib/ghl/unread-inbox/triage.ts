// Triagem das conversas não lidas de WhatsApp da arena de vendedores.
// Módulo puro: sem server-only, next ou Supabase.
import type { NegotiationMessage } from "@/lib/ghl/negotiation-conversations";

export type TriageCategory = "quente" | "morno" | "frio" | "pos_venda";

/** Ordem da fila: mais perto de fechar primeiro; pós-venda por último. */
export const CATEGORY_ORDER: readonly TriageCategory[] = ["quente", "morno", "frio", "pos_venda"];

/** Janela do WhatsApp: depois de 24h da última mensagem do cliente, só template. */
export const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Sem amostra digital entregue, a triagem olha só o fim da conversa. */
export const FALLBACK_RECENT_MESSAGES = 20;
/** Teto de mensagens mandadas à IA, mesmo com o corte na amostra. */
export const MAX_CUT_MESSAGES = 40;

/** Primeira etapa pós-venda do pipeline Atendimento; dali em diante o cliente já pagou. */
export const FIRST_POST_SALE_STAGE = "Pagamento Confirmado/Completar Dados";

const SAMPLE_MENTION = /amostras?\s+digita(l|is)/i;

/**
 * Entrega da amostra digital: mensagem nossa que fala da amostra e a entrega
 * (texto de "ficou pronta" ou com o arquivo anexado). A mensagem do robô que
 * só anuncia que o designer vai criar a amostra não conta.
 */
function isSampleDelivery(message: NegotiationMessage): boolean {
  if (message.direction !== "outbound" || !SAMPLE_MENTION.test(message.body)) return false;
  return /pront/i.test(message.body) || message.attachments.length > 0;
}

/**
 * Corta a conversa na última entrega de amostra digital: o que veio antes
 * (robô, orçamento automático) já está resumido no card. Sem entrega, fica
 * com as últimas mensagens.
 */
export function cutTranscript(messages: NegotiationMessage[]): {
  messages: NegotiationMessage[];
  from: "amostra_digital" | "recentes";
} {
  let deliveryIndex = -1;
  messages.forEach((m, index) => {
    if (isSampleDelivery(m)) deliveryIndex = index;
  });
  if (deliveryIndex < 0) {
    return { messages: messages.slice(-FALLBACK_RECENT_MESSAGES), from: "recentes" };
  }
  return { messages: messages.slice(deliveryIndex).slice(-MAX_CUT_MESSAGES), from: "amostra_digital" };
}

export function isWindowOpen(lastInboundAtMs: number, nowMs: number): boolean {
  return nowMs - lastInboundAtMs < WHATSAPP_WINDOW_MS;
}

/**
 * Pós-venda sem precisar de IA: venda ganha, pedido de representante ou card
 * do Atendimento já na etapa de pagamento confirmado ou depois.
 */
export function isPostSale(input: {
  won: boolean;
  pipelineName: string | null;
  stageName: string | null;
  /** Etapas do pipeline Atendimento, na ordem do funil. */
  atendimentoStages: readonly string[];
}): boolean {
  if (input.won) return true;
  if (input.pipelineName === "Representantes") return true;
  if (input.pipelineName !== "Atendimento" || !input.stageName) return false;
  const stageIndex = input.atendimentoStages.indexOf(input.stageName);
  const firstPostSale = input.atendimentoStages.indexOf(FIRST_POST_SALE_STAGE);
  return stageIndex >= 0 && firstPostSale >= 0 && stageIndex >= firstPostSale;
}

/** Categoria na ordem da fila; dentro dela, quem espera há mais tempo primeiro. */
export function sortTriage<T extends { category: TriageCategory | null; lastInboundAt: string }>(
  items: T[],
): T[] {
  const rank = (c: TriageCategory | null) => (c ? CATEGORY_ORDER.indexOf(c) : CATEGORY_ORDER.length);
  return [...items].sort(
    (a, b) =>
      rank(a.category) - rank(b.category) ||
      Date.parse(a.lastInboundAt) - Date.parse(b.lastInboundAt),
  );
}
