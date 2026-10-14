// Configuração da Cami vinda do banco (ai_seller_settings), com os valores do
// código como reserva. Módulo puro.
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
}

export const DEFAULT_SETTINGS: SellerSettings = {
  estado: "ligada",
  minPares: ASSIGN_MIN_PARES,
  maxPares: ASSIGN_MAX_PARES,
  escalationUserId: null,
  escalationName: "Schay",
  shifts: ESCALATION_SHIFTS,
};

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
  };
}
