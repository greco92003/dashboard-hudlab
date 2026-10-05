export const BRAZIL_MAP_STEPS = 5;

/** Limites superiores das faixas por quantil dos valores não nulos (até 4 cortes). */
export function quantileBreaks(values: number[], steps: number = BRAZIL_MAP_STEPS): number[] {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const n = sorted.length;
  if (n < 2) return [];
  const cuts: number[] = [];
  for (let i = 1; i < steps; i++) {
    const c = sorted[Math.floor((i * n) / steps)];
    if (!cuts.includes(c)) cuts.push(c);
  }
  return cuts;
}

/** Faixa 0..steps-1 do valor; null quando o valor é null. */
export function stepFor(value: number | null, breaks: number[], steps: number = BRAZIL_MAP_STEPS): number | null {
  if (value === null) return null;
  let i = breaks.findIndex((b) => value < b);
  if (i === -1) i = breaks.length;
  // Reescala para 0..steps-1 quando há menos cortes
  return Math.round((i * (steps - 1)) / Math.max(breaks.length, 1));
}

/** Intensidade 0..1 da faixa; "sequential-inverted" inverte (menor valor = mais forte). */
export function stepIntensity(step: number, steps: number, scale: "sequential" | "sequential-inverted"): number {
  const s = scale === "sequential" ? step : steps - 1 - step;
  return 0.2 + (0.8 * s) / (steps - 1);
}
