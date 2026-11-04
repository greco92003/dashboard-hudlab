// Horário de quem recebe as passagens da Cami. Módulo puro.
import { ESCALATION_SHIFTS } from "./config";

/** Brasil sem horário de verão desde 2019: Brasília é sempre UTC-3. */
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function label(hhmm: string): string {
  const [h, m] = hhmm.split(":");
  return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`;
}

/** Feriados nacionais de data fixa (mês-dia). Carnaval e Corpus Christi são ponto facultativo: ficam de fora. */
const FERIADOS_FIXOS = new Set(["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"]);

/** Sexta-feira Santa (dois dias antes da Páscoa, cálculo de Meeus), como "MM-DD". */
function sextaSanta(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - Math.floor(b / 4) - g + 15) % 30;
  const l = (32 + 2 * (b % 4) + 2 * Math.floor(c / 4) - h - (c % 4)) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  const pascoa = Date.UTC(ano, Math.floor(n / 31) - 1, (n % 31) + 1);
  return new Date(pascoa - 2 * DAY_MS).toISOString().slice(5, 10);
}

/** Feriado nacional no dia de `localMs` (já em horário de Brasília). */
export function isFeriado(localMs: number): boolean {
  const iso = new Date(localMs).toISOString();
  const mesDia = iso.slice(5, 10);
  return FERIADOS_FIXOS.has(mesDia) || mesDia === sextaSanta(Number(iso.slice(0, 4)));
}

/** Dia de turno: segunda a sexta, fora de feriado. `localMs` já em horário de Brasília. */
const isWorkday = (localMs: number) => {
  const weekday = new Date(localMs).getUTCDay();
  return weekday >= 1 && weekday <= 5 && !isFeriado(localMs);
};
const WEEKDAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/**
 * Minutos de turno (segunda a sexta, horário de Brasília) entre dois
 * instantes. Uma passagem às 17h50 de sexta respondida às 8h40 de segunda
 * esperou 20 minutos úteis, não 63 horas.
 */
export function businessMinutesBetween(
  fromMs: number,
  toMs: number,
  shifts: ReadonlyArray<readonly [start: string, end: string]> = ESCALATION_SHIFTS,
): number {
  if (toMs <= fromMs) return 0;
  const start = fromMs - BRT_OFFSET_MS;
  const end = toMs - BRT_OFFSET_MS;
  let totalMs = 0;
  // Teto de 90 dias: uma passagem esquecida não vira um laço longo.
  const lastDay = Math.min(end, start + 90 * DAY_MS);
  for (let day = Math.floor(start / DAY_MS) * DAY_MS; day < lastDay; day += DAY_MS) {
    if (!isWorkday(day)) continue;
    for (const [shiftStart, shiftEnd] of shifts) {
      const lo = Math.max(day + toMinutes(shiftStart) * 60_000, start);
      const hi = Math.min(day + toMinutes(shiftEnd) * 60_000, end);
      if (hi > lo) totalMs += hi - lo;
    }
  }
  return totalMs / 60_000;
}

export interface Availability {
  /** Dentro de um turno agora. */
  available: boolean;
  /** Quando volta, para o cliente: "hoje às 14h", "amanhã às 8h30", "segunda às 8h30". null se disponível. */
  returnsAt: string | null;
  /** Agora em Brasília, "HH:MM". */
  nowLabel: string;
}

export function escalationAvailability(
  nowMs: number,
  shifts: ReadonlyArray<readonly [start: string, end: string]> = ESCALATION_SHIFTS,
): Availability {
  const local = new Date(nowMs - BRT_OFFSET_MS);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  const nowLabel = `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;

  if (isWorkday(local.getTime())) {
    for (const [start, end] of shifts) {
      if (minutes >= toMinutes(start) && minutes < toMinutes(end)) {
        return { available: true, returnsAt: null, nowLabel };
      }
      if (minutes < toMinutes(start)) {
        return { available: false, returnsAt: `hoje às ${label(start)}`, nowLabel };
      }
    }
  }

  const firstStart = label(shifts[0][0]);
  for (let days = 1; days <= 7; days++) {
    const next = local.getTime() + days * DAY_MS;
    if (!isWorkday(next)) continue;
    const when = days === 1 ? "amanhã" : WEEKDAY_NAMES[new Date(next).getUTCDay()];
    return { available: false, returnsAt: `${when} às ${firstStart}`, nowLabel };
  }
  return { available: false, returnsAt: null, nowLabel };
}
