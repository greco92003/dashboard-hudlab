// Configuração da Cami vinda do banco (ai_seller_settings), com os valores do
// código como reserva. Módulo puro.
import { DEFAULT_ALERTS, type AlertSettings } from "./alerts";
import { ASSIGN_MAX_PARES, ASSIGN_MIN_PARES, ESCALATION_SHIFTS } from "./config";

export type SellerState = "ligada" | "nao_pega_novos" | "desligada";
export type Shift = readonly [start: string, end: string];

export interface SellerSettings {
  estado: SellerState;
  minPares: number;
  maxPares: number;
  /** null = usa AI_SELLER_ESCALATION_USER_ID. */
  escalationUserId: string | null;
  escalationName: string;
  shifts: ReadonlyArray<Shift>;
  /** Para estimar o custo: preço do modelo (US$ por milhão de tokens) e dólar. */
  custo: { entradaUsdPorMilhao: number; saidaUsdPorMilhao: number; dolar: number };
  alertas: AlertSettings;
}

export const DEFAULT_SETTINGS: SellerSettings = {
  estado: "ligada",
  minPares: ASSIGN_MIN_PARES,
  maxPares: ASSIGN_MAX_PARES,
  escalationUserId: null,
  escalationName: "Schay",
  shifts: ESCALATION_SHIFTS,
  custo: { entradaUsdPorMilhao: 2.5, saidaUsdPorMilhao: 15, dolar: 5.4 },
  alertas: DEFAULT_ALERTS,
};

const validMinutes = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 15 && n <= 24 * 60;

/** Alertas do banco; o resumo diário antigo vinha como horário ("18:30") e conta como ligado. */
function validAlertas(value: unknown): AlertSettings | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (!validMinutes(v.passagemSemRespostaMin) || !validMinutes(v.ownerAposMin)) return null;
  return {
    passagemSemRespostaMin: v.passagemSemRespostaMin as number,
    ownerAposMin: v.ownerAposMin as number,
    resumoDiario: typeof v.resumoDiario === "boolean" ? v.resumoDiario : Boolean(v.resumoDiario),
  };
}

function validCusto(value: unknown): SellerSettings["custo"] | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const nums = [v.entradaUsdPorMilhao, v.saidaUsdPorMilhao, v.dolar];
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0)) return null;
  return {
    entradaUsdPorMilhao: v.entradaUsdPorMilhao as number,
    saidaUsdPorMilhao: v.saidaUsdPorMilhao as number,
    dolar: v.dolar as number,
  };
}

const STATES: readonly SellerState[] = ["ligada", "nao_pega_novos", "desligada"];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function validShifts(value: unknown): ReadonlyArray<Shift> | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const shifts: Shift[] = [];
  for (const item of value) {
    if (!Array.isArray(item) || item.length !== 2) return null;
    const [start, end] = item;
    if (typeof start !== "string" || typeof end !== "string") return null;
    if (!HHMM.test(start) || !HHMM.test(end) || start >= end) return null;
    shifts.push([start, end]);
  }
  return shifts.sort((a, b) => a[0].localeCompare(b[0]));
}

/** Linha do banco → configuração; cada campo inválido cai no padrão do código. */
export function normalizeSettings(row: Record<string, unknown> | null | undefined): SellerSettings {
  if (!row) return DEFAULT_SETTINGS;
  const estado = STATES.includes(row.estado as SellerState) ? (row.estado as SellerState) : DEFAULT_SETTINGS.estado;
  const min = Number.isInteger(row.min_pares) ? (row.min_pares as number) : DEFAULT_SETTINGS.minPares;
  const max = Number.isInteger(row.max_pares) ? (row.max_pares as number) : DEFAULT_SETTINGS.maxPares;
  const rangeOk = min >= 12 && max >= min;
  const userId = typeof row.escalation_user_id === "string" && row.escalation_user_id.trim()
    ? row.escalation_user_id.trim()
    : null;
  const name = typeof row.escalation_name === "string" && row.escalation_name.trim()
    ? row.escalation_name.trim()
    : DEFAULT_SETTINGS.escalationName;
  return {
    estado,
    minPares: rangeOk ? min : DEFAULT_SETTINGS.minPares,
    maxPares: rangeOk ? max : DEFAULT_SETTINGS.maxPares,
    escalationUserId: userId,
    escalationName: name,
    shifts: validShifts(row.escalation_shifts) ?? DEFAULT_SETTINGS.shifts,
    custo: validCusto(row.custo) ?? DEFAULT_SETTINGS.custo,
    alertas: validAlertas(row.alertas) ?? DEFAULT_SETTINGS.alertas,
  };
}

/**
 * O que o owner manda salvar no Controle → linha do banco. Diferente da
 * leitura, aqui valor inválido é recusado com a explicação, nunca trocado
 * pelo padrão em silêncio.
 */
export function validateSettingsInput(
  body: unknown,
): { ok: true; row: Record<string, unknown> } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Corpo inválido" };
  const b = body as Record<string, unknown>;
  if (!STATES.includes(b.estado as SellerState)) return { ok: false, error: "Estado inválido" };
  const min = b.minPares;
  const max = b.maxPares;
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    return { ok: false, error: "A faixa de pares precisa ser de números inteiros" };
  }
  if ((min as number) < 12) return { ok: false, error: "O mínimo é 12 pares (pedido mínimo)" };
  if ((max as number) < (min as number)) return { ok: false, error: "O máximo não pode ser menor que o mínimo" };
  const name = typeof b.escalationName === "string" ? b.escalationName.trim() : "";
  if (!name) return { ok: false, error: "Diga o nome de quem recebe as passagens" };
  const userId = typeof b.escalationUserId === "string" ? b.escalationUserId.trim() : "";
  const shifts = validShifts(b.shifts);
  if (!shifts) return { ok: false, error: "Turnos inválidos: use HH:MM e início antes do fim" };
  const custo = validCusto(b.custo);
  if (!custo) return { ok: false, error: "Preço do modelo e dólar precisam ser números maiores que zero" };
  const alertas = validAlertas(b.alertas);
  if (!alertas) return { ok: false, error: "Prazos dos alertas: minutos inteiros entre 15 e 1440" };
  if (alertas.ownerAposMin < alertas.passagemSemRespostaMin) {
    return { ok: false, error: "O aviso para o dono não pode vir antes do aviso para quem recebe as passagens" };
  }
  return {
    ok: true,
    row: {
      estado: b.estado,
      min_pares: min,
      max_pares: max,
      escalation_user_id: userId || null,
      escalation_name: name,
      escalation_shifts: shifts,
      custo,
      alertas,
    },
  };
}
