// Constantes da IA vendedora (spec: docs/superpowers/specs/2026-09-29-ia-vendedora-nucleo-conversa-design.md).
// Módulo puro: sem server-only, next ou Supabase.

export const AI_SELLER_MODEL = "gpt-5.6-terra";

export const AI_TAG = "ia-atendimento";
export const AI_TEST_TAG = "ia-teste";
export const AI_ESCALATED_TAG = "ia-escalado";

/** Mensagem do cliente mais nova que isso: outra chamada, disparada por ela, vai responder. */
export const DEBOUNCE_MS = 80_000;
export const MAX_AI_SENDS_PER_HOUR = 6;
export const MAX_AGENT_STEPS = 5;
/** Nenhum passo do loop começa depois disso (desde o início da rodada): sobra tempo para escalar. */
export const AGENT_DEADLINE_MS = 85_000;
/** Timeout de cada chamada ao modelo; o loop já repete uma vez. */
export const MODEL_CALL_TIMEOUT_MS = 30_000;
export const LARGE_ORDER_PARES = 500;
export const FREE_SHIPPING_MIN_PARES = 36;

export const GHL_ATENDIMENTO_PIPELINE_ID = "xrsxNXLo0SIkWAxiHPf0";
export const ART_CHANGE_STAGE_NAME = "Alteração";

export const AI_MOVABLE_STAGES = [
  "Atendimento",
  "Negociação",
  "Prioridade de Fechamento",
] as const;
export type AiMovableStage = (typeof AI_MOVABLE_STAGES)[number];

export const MODEL_ESCALATION_REASONS = [
  "pedido_grande",
  "desconto_ou_excecao",
  "reclamacao",
  "cliente_pediu_pessoa",
  "pronto_para_pagar",
  "outro",
] as const;
export type ModelEscalationReason = (typeof MODEL_ESCALATION_REASONS)[number];

export function personaName(): string {
  return process.env.AI_SELLER_PERSONA_NAME || "Lia";
}

export function escalationUserId(): string {
  const id = process.env.AI_SELLER_ESCALATION_USER_ID;
  if (!id) throw new Error("AI_SELLER_ESCALATION_USER_ID não configurado");
  return id;
}

export function escalationUserName(): string {
  return process.env.AI_SELLER_ESCALATION_NAME || "Schay";
}
