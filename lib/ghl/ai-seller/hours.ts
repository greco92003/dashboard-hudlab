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

const isWorkday = (weekday: number) => weekday >= 1 && weekday <= 5;
const WEEKDAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

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
  const weekday = local.getUTCDay();
  const nowLabel = `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;

  if (isWorkday(weekday)) {
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
    const next = new Date(local.getTime() + days * DAY_MS).getUTCDay();
    if (!isWorkday(next)) continue;
    const when = days === 1 ? "amanhã" : WEEKDAY_NAMES[next];
    return { available: false, returnsAt: `${when} às ${firstStart}`, nowLabel };
  }
  return { available: false, returnsAt: null, nowLabel };
}
