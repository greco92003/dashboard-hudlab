// Regras da casa e conversas de referência da Cami. Módulo puro.
import type { NegotiationMessage } from "@/lib/ghl/negotiation-conversations";

/** Teto de regras ligadas: regra que se provou vai para o manual e sai da lista. */
export const MAX_ACTIVE_RULES = 15;
export const RULE_MIN_CHARS = 5;
export const RULE_MAX_CHARS = 600;
/** Referências testadas de uma vez (cada uma roda a Cami duas vezes). */
export const MAX_REFERENCES_PER_TEST = 8;

export function validateRuleText(texto: unknown): { ok: true; texto: string } | { ok: false; error: string } {
  const t = typeof texto === "string" ? texto.replace(/\s+/g, " ").trim() : "";
  if (t.length < RULE_MIN_CHARS) return { ok: false, error: "Escreva a regra (pelo menos 5 caracteres)" };
  if (t.length > RULE_MAX_CHARS) return { ok: false, error: `Regra longa demais (até ${RULE_MAX_CHARS} caracteres)` };
  return { ok: true, texto: t };
}

/** Pode ligar mais uma regra? `activeCount` não conta a regra que está sendo ligada. */
export function canActivateRule(activeCount: number): boolean {
  return activeCount < MAX_ACTIVE_RULES;
}

/** Seção das instruções da Cami com as regras ligadas; vazia sem regras. */
export function rulesSection(rules: readonly string[]): string {
  if (rules.length === 0) return "";
  const list = rules.map((r, i) => `${i + 1}. ${r}`).join("\n");
  return `===== REGRAS DA CASA (definidas pelo dono; valem acima do manual) =====
${list}
===== FIM DAS REGRAS DA CASA =====`;
}

/** Mensagem guardada numa referência: a da conversa + se foi a própria IA que enviou. */
export interface SnapshotMessage extends NegotiationMessage {
  own: boolean;
}

/**
 * Foto da conversa para referência: vai até a mensagem do cliente escolhida
 * (ou a última do cliente) — o ponto em que a Cami precisa responder. null se
 * o cliente nunca escreveu.
 */
export function cutReferenceSnapshot(
  messages: NegotiationMessage[],
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

/** Aceita o ID do contato ou um link do GHL que o contenha (…/contacts/detail/<id>). */
export function parseGhlContactId(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const text = input.trim();
  const fromUrl = text.match(/contacts\/detail\/([A-Za-z0-9]{10,40})/);
  if (fromUrl) return fromUrl[1];
  return /^[A-Za-z0-9]{10,40}$/.test(text) ? text : null;
}
