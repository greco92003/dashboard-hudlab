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

/**
 * Primeira etapa pós-venda do pipeline Atendimento: dali em diante o pedido é
 * do pós-venda (Amanda). Pagamento Confirmado ainda é do vendedor, que fecha
 * arte e grade antes de passar o card para Cadastro ERP.
 */
export const FIRST_POST_SALE_STAGE = "Cadastro ERP";

/** Primeira etapa de pedido fechado: dali até Cadastro ERP o cliente completa grade e arte com o vendedor. */
export const FIRST_CLOSED_STAGE = "Pagamento Confirmado/Completar Dados";

const SAMPLE_MENTION = /amostras?\s+digita(l|is)/i;

/**
 * Entrega da amostra digital: mensagem nossa que fala da amostra e a entrega
 * (texto de "ficou pronta" ou com o arquivo anexado). A mensagem do robô que
 * só anuncia que o designer vai criar a amostra não conta.
 */
export function isSampleDelivery(message: NegotiationMessage): boolean {
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

/** Quanto falta para a janela de 24h fechar (0 se já fechou). */
export function windowRemainingMs(lastInboundAtMs: number, nowMs: number): number {
  return Math.max(0, lastInboundAtMs + WHATSAPP_WINDOW_MS - nowMs);
}

/**
 * O que o cliente escreveu por último. O resumo da conversa no GHL traz a
 * última mensagem de qualquer tipo — resposta automática de chamada perdida,
 * envio nosso —, que não diz nada sobre o que o cliente quer.
 */
export function lastClientMessageText(messages: NegotiationMessage[]): string | null {
  const last = [...messages].reverse().find((m) => m.direction === "inbound");
  if (!last) return null;
  const text = last.body.replace(/\s+/g, " ").trim();
  if (text) return text;
  return last.attachments.length ? "Enviou um anexo (imagem, áudio ou arquivo)" : null;
}

/** Anexos do cliente baixados por conversa para achar áudio: os mais recentes bastam para a triagem. */
export const MAX_CLIENT_ATTACHMENTS = 3;

/** Anexos das mensagens do cliente, da mais recente para a mais antiga, até o teto. */
export function recentClientAttachments(
  messages: NegotiationMessage[],
): Array<{ messageId: string; url: string }> {
  const refs: Array<{ messageId: string; url: string }> = [];
  for (const m of [...messages].reverse()) {
    if (m.direction !== "inbound") continue;
    for (const url of m.attachments) refs.push({ messageId: m.id, url });
  }
  return refs.slice(0, MAX_CLIENT_ATTACHMENTS);
}

/** Põe a transcrição do áudio no texto da mensagem, para a triagem e a fila lerem o que o cliente falou. */
export function withAudioTranscripts(
  messages: NegotiationMessage[],
  transcripts: ReadonlyMap<string, readonly string[]>,
): NegotiationMessage[] {
  return messages.map((m) => {
    const audios = transcripts.get(m.id);
    if (!audios?.length) return m;
    const spoken = audios.map((t) => `(áudio) ${t}`).join(" ");
    return { ...m, body: m.body.trim() ? `${m.body} ${spoken}` : spoken };
  });
}

export interface StageInput {
  won: boolean;
  pipelineName: string | null;
  stageName: string | null;
  /** Etapas do pipeline Atendimento, na ordem do funil. */
  atendimentoStages: readonly string[];
}

/**
 * Categoria que sai da etapa, sem IA:
 * - "pos_venda": card do Atendimento de Cadastro ERP em diante, pedido de
 *   representante ou venda ganha fora do Atendimento (ou em etapa que não
 *   está mais no funil);
 * - "pedido_fechado": card do Atendimento ganho, ou de Pagamento Confirmado em
 *   diante, que ainda não chegou a Cadastro ERP. O GHL marca a venda como
 *   ganha já em Pagamento Confirmado; o cliente ainda manda grade e arte, e é
 *   do vendedor;
 * - null: negociação, vai para a triagem da IA.
 */
export function stageVerdict(input: StageInput): "pos_venda" | "pedido_fechado" | null {
  if (input.pipelineName === "Representantes") return "pos_venda";
  if (input.pipelineName === "Atendimento" && input.stageName) {
    const stageIndex = input.atendimentoStages.indexOf(input.stageName);
    const firstPostSale = input.atendimentoStages.indexOf(FIRST_POST_SALE_STAGE);
    const firstClosed = input.atendimentoStages.indexOf(FIRST_CLOSED_STAGE);
    if (stageIndex >= 0 && firstPostSale >= 0) {
      if (stageIndex >= firstPostSale) return "pos_venda";
      if (input.won || (firstClosed >= 0 && stageIndex >= firstClosed)) return "pedido_fechado";
      return null;
    }
  }
  return input.won ? "pos_venda" : null;
}

export function isPostSale(input: StageInput): boolean {
  return stageVerdict(input) === "pos_venda";
}

/** Começo do motivo do pedido fechado: marca que o Quente veio da etapa, não da IA. */
export const CLOSED_ORDER_REASON = "Pedido fechado";

/** Categoria e motivo do que a etapa decide. */
export function stageClassification(
  verdict: "pos_venda" | "pedido_fechado",
  input: { won: boolean; pipelineName: string | null; stageName: string | null },
): { category: TriageCategory; reason: string } {
  const card = input.stageName ? ` (card em ${input.stageName})` : "";
  if (verdict === "pedido_fechado") {
    return { category: "quente", reason: `${CLOSED_ORDER_REASON}: completar dados do pedido${card}.` };
  }
  if (input.pipelineName === "Representantes") return { category: "pos_venda", reason: `Pedido de representante${card}.` };
  if (input.pipelineName === "Atendimento" && input.stageName && !input.won) {
    return { category: "pos_venda", reason: `Pedido no pós-venda: card em ${input.stageName}.` };
  }
  return { category: "pos_venda", reason: `Venda ganha${card}.` };
}

/** A classificação guardada veio da etapa (pós-venda ou pedido fechado), não da IA. */
export function isStageClassification(row: { category: TriageCategory | null; reason: string | null }): boolean {
  return row.category === "pos_venda" || (row.reason ?? "").startsWith(`${CLOSED_ORDER_REASON}:`);
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
