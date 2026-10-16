// Anexo de atendimento da Cami: aprendizados dos feedbacks, revisados toda
// semana e aprovados pelo dono. E as "fotos" de conversa usadas para mostrar
// como a Cami teria respondido. Módulo puro.
import type { NegotiationMessage } from "@/lib/ghl/negotiation-conversations";
import { ART_CHANGE_STAGE_NAME } from "./config";

/** Teto de itens ativos: o anexo é reescrito inteiro e precisa caber numa leitura. */
export const MAX_ANNEX_ITEMS = 15;
export const ANNEX_ITEM_MIN_CHARS = 5;
export const ANNEX_ITEM_MAX_CHARS = 400;

export type AnnexEstado = "novo" | "ajustado" | "mantido" | "removido";
export const ANNEX_ESTADOS: readonly AnnexEstado[] = ["novo", "ajustado", "mantido", "removido"];

export interface AnnexExample {
  opportunityId: string;
  nome: string | null;
  /** A mensagem do cliente que a Cami respondia. */
  cliente: string;
  antes: string[];
  depois: string[];
}

export interface AnnexItem {
  texto: string;
  estado: AnnexEstado;
  /** Texto atual do item (ajustado/removido). */
  antes: string | null;
  motivo: string | null;
  feedbackIds: string[];
  exemplo?: AnnexExample | null;
}

/** O que vale para a Cami: tudo menos o removido. */
export function activeTexts(items: readonly AnnexItem[]): string[] {
  return items.filter((i) => i.estado !== "removido").map((i) => i.texto);
}

/** Seção das instruções da Cami com o anexo em vigor; vazia sem itens. */
export function annexSection(texts: readonly string[]): string {
  if (texts.length === 0) return "";
  const list = texts.map((t, i) => `${i + 1}. ${t}`).join("\n");
  return `===== ANEXO DE ATENDIMENTO (aprendizados aprovados pelo dono; valem acima do jeito de atender) =====
${list}
===== FIM DO ANEXO =====`;
}

const clean = (s: unknown) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "");

/**
 * Resposta da IA → itens válidos. Corta texto vazio ou longo demais, estado
 * desconhecido e ids de feedback que não estavam na revisão.
 */
export function parseAnnexResponse(
  raw: unknown,
  feedbackIds: ReadonlySet<string>,
): { itens: AnnexItem[]; paraOManual: string[]; resumo: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const itens: AnnexItem[] = [];
  for (const it of Array.isArray(r.itens) ? r.itens : []) {
    const o = (it && typeof it === "object" ? it : {}) as Record<string, unknown>;
    const estado = ANNEX_ESTADOS.includes(o.estado as AnnexEstado) ? (o.estado as AnnexEstado) : null;
    const texto = clean(o.texto);
    if (!estado || texto.length < ANNEX_ITEM_MIN_CHARS) continue;
    itens.push({
      texto: texto.slice(0, ANNEX_ITEM_MAX_CHARS),
      estado,
      antes: clean(o.antes) || null,
      motivo: clean(o.motivo) || null,
      feedbackIds: (Array.isArray(o.feedbackIds) ? o.feedbackIds : []).filter(
        (id): id is string => typeof id === "string" && feedbackIds.has(id),
      ),
    });
  }
  const paraOManual = (Array.isArray(r.paraOManual) ? r.paraOManual : []).map(clean).filter(Boolean);
  return { itens, paraOManual, resumo: clean(r.resumo) };
}

/**
 * Item aprovado nunca some em silêncio: todo item em vigor precisa aparecer
 * como mantido, ajustado ou removido. O que a IA esqueceu volta como mantido.
 * Também: no máximo MAX_ANNEX_ITEMS ativos (o excedente de itens novos sai).
 */
export function reconcileWithCurrent(current: readonly string[], items: readonly AnnexItem[]): AnnexItem[] {
  const out = items.map((i) => ({ ...i }));
  const covered = new Set<string>();
  for (const i of out) {
    if (i.estado === "mantido") covered.add(i.texto);
    if ((i.estado === "ajustado" || i.estado === "removido") && i.antes) covered.add(i.antes);
  }
  for (const text of current) {
    if (!covered.has(text)) out.push({ texto: text, estado: "mantido", antes: null, motivo: null, feedbackIds: [] });
  }
  // "Mantido" com texto que não estava em vigor é, na verdade, novo.
  const currentSet = new Set(current);
  for (const i of out) if (i.estado === "mantido" && !currentSet.has(i.texto)) i.estado = "novo";

  let active = 0;
  return out.filter((i) => {
    if (i.estado === "removido") return true;
    active++;
    return active <= MAX_ANNEX_ITEMS || i.estado !== "novo";
  });
}

/** O dono ajustou os textos antes de aprovar: mesma lista, só os textos mudam. */
export function applyEdits(
  items: readonly AnnexItem[],
  textos: unknown,
): { ok: true; itens: AnnexItem[] } | { ok: false; error: string } {
  if (textos == null) return { ok: true, itens: [...items] };
  if (!Array.isArray(textos) || textos.length !== items.length) return { ok: false, error: "Lista de itens não confere" };
  const itens: AnnexItem[] = [];
  for (const [i, item] of items.entries()) {
    if (item.estado === "removido") {
      itens.push(item);
      continue;
    }
    const texto = clean(textos[i]);
    if (texto.length < ANNEX_ITEM_MIN_CHARS) return { ok: false, error: `Item ${i + 1}: escreva o texto (ou descarte a revisão)` };
    if (texto.length > ANNEX_ITEM_MAX_CHARS) return { ok: false, error: `Item ${i + 1}: até ${ANNEX_ITEM_MAX_CHARS} caracteres` };
    itens.push(texto === item.texto ? item : { ...item, texto });
  }
  return { ok: true, itens };
}

export function annexStats(items: readonly AnnexItem[]): Record<AnnexEstado, number> & { ativos: number } {
  const stats = { novo: 0, ajustado: 0, mantido: 0, removido: 0, ativos: 0 };
  for (const i of items) {
    stats[i.estado]++;
    if (i.estado !== "removido") stats.ativos++;
  }
  return stats;
}

// ---------------------------------------------------------------------------
// Fotos de conversa para simular a Cami ("como teria sido", Você × Cami)
// ---------------------------------------------------------------------------

/** Mensagem guardada numa foto: a da conversa + se foi a própria IA que enviou. */
export interface SnapshotMessage extends NegotiationMessage {
  own: boolean;
}

export interface ReferenceContext {
  contactName: string | null;
  pipelineName: string | null;
  stageName: string | null;
  crmPares: number | null;
  crmValor: number | null;
  /** Momento da última mensagem do cliente na foto: a Cami responde "naquele dia". */
  at: string;
}

export interface Reference {
  id: string;
  nome: string;
  contactId: string;
  messages: SnapshotMessage[];
  context: ReferenceContext;
}

/**
 * Foto da conversa até a mensagem do cliente escolhida (ou a última do
 * cliente): o ponto em que a Cami precisa responder. null se o cliente nunca
 * escreveu.
 */
export function cutReferenceSnapshot(
  messages: readonly NegotiationMessage[],
  ownMessageIds: ReadonlySet<string>,
  uptoMessageId?: string | null,
): SnapshotMessage[] | null {
  let endIndex = -1;
  messages.forEach((m, i) => {
    if (m.direction !== "inbound") return;
    if (uptoMessageId ? m.id === uptoMessageId : true) endIndex = i;
  });
  if (endIndex < 0) return null;
  return messages.slice(0, endIndex + 1).map((m) => ({ ...m, own: ownMessageIds.has(m.id) }));
}

/**
 * Ponto para o "como teria sido" de um feedback: a mensagem do cliente logo
 * antes da primeira resposta marcada da Cami (sem marcação, antes da última
 * resposta dela), e o que ela respondeu ali. null se a Cami não respondeu.
 */
export function exampleCut(
  messages: readonly NegotiationMessage[],
  camiIds: ReadonlySet<string>,
  marcadas: readonly string[],
): { clientMessageId: string; cliente: string; antes: string[] } | null {
  const marked = new Set(marcadas);
  let camiIndex = -1;
  messages.forEach((m, i) => {
    if (!camiIds.has(m.id)) return;
    if (marked.size ? marked.has(m.id) && camiIndex < 0 : true) camiIndex = i;
  });
  if (camiIndex < 0) return null;
  let clientIndex = -1;
  for (let i = camiIndex - 1; i >= 0; i--) {
    if (messages[i].direction === "inbound") {
      clientIndex = i;
      break;
    }
  }
  if (clientIndex < 0) return null;
  const antes: string[] = [];
  for (let i = clientIndex + 1; i < messages.length && messages[i].direction !== "inbound"; i++) {
    if (camiIds.has(messages[i].id) && messages[i].body) antes.push(messages[i].body);
  }
  const client = messages[clientIndex];
  const cliente = client.body?.trim() || (client.attachments?.length ? "[imagem ou arquivo]" : "(mensagem sem texto)");
  return { clientMessageId: client.id, cliente, antes };
}

/**
 * Na simulação, o pedido de ajuste de arte responde como em produção: cliente
 * na etapa Alteração já tem o ajuste aberto ("ja_em_alteracao", e a Cami não
 * repete o prazo).
 */
export function simulatedArtChangeStatus(stageName: string | null): "movido" | "ja_em_alteracao" {
  return stageName?.trim().toLowerCase() === ART_CHANGE_STAGE_NAME.toLowerCase() ? "ja_em_alteracao" : "movido";
}
