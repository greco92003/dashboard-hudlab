// Constantes da IA vendedora (spec: docs/superpowers/specs/2026-09-29-ia-vendedora-nucleo-conversa-design.md).
// Módulo puro: sem server-only, next ou Supabase.

export const AI_SELLER_MODEL = "gpt-5.6-terra";

export const AI_TAG = "ia-atendimento";
export const AI_TEST_TAG = "ia-teste";
export const AI_ESCALATED_TAG = "ia-escalado";

/** Proteção contra loop, por contato: respostas (rodadas que enviaram algo) e balões na última hora. */
export const MAX_AI_REPLIES_PER_HOUR = 15;
export const MAX_AI_SENDS_PER_HOUR = 40;
export const MAX_AGENT_STEPS = 5;
/**
 * Silêncio do cliente antes de responder: junta a rajada ("oi" / "quero
 * chinelo" / "pra 30 pessoas") numa resposta só. Antes era a espera de 90s do
 * workflow do GHL, que chegava a ~4 min.
 */
export const CLIENT_PAUSE_MS = 25_000;
/** Quanto a chamada espera outra rodada do contato terminar antes de desistir. */
export const LOCK_WAIT_MS = 60_000;
export const LOCK_RETRY_MS = 3_000;
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

/** Nome da IA para o cliente e no CRM (era Lia no piloto). Fixo no código: a variável de ambiente antiga é ignorada. */
export const PERSONA_NAME = "Cami";

export function personaName(): string {
  return PERSONA_NAME;
}

/** Valor gravado no campo Vendedor da oportunidade quando a Cami assume: as vendas dela aparecem como dela. */
export const AI_VENDEDOR_NAME = "CAMI";
export const VENDEDOR_FIELD_ID = "QbfXsa8G1pDMFEFuRyUX";

/**
 * Pedidos que a Cami assume sozinha quando a amostra é entregue. Começa pelos
 * de 12 pares (39% das amostras, ~3% da receita) e cresce com os resultados.
 */
export const ASSIGN_MIN_PARES = 12;
export const ASSIGN_MAX_PARES = 12;
/** Alguém do time escreveu ao cliente nesse período: a conversa é dele, a Cami não entra. */
export const HUMAN_RECENT_MS = 72 * 60 * 60 * 1000;

/** Atendimento de quem recebe as passagens (horário de Brasília), segunda a sexta. */
export const ESCALATION_SHIFTS: ReadonlyArray<readonly [start: string, end: string]> = [
  ["08:30", "12:00"],
  ["14:00", "18:00"],
];

export function escalationUserId(): string {
  const id = process.env.AI_SELLER_ESCALATION_USER_ID;
  if (!id) throw new Error("AI_SELLER_ESCALATION_USER_ID não configurado");
  return id;
}

export function escalationUserName(): string {
  return process.env.AI_SELLER_ESCALATION_NAME || "Schay";
}
