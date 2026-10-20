import { FREE_SHIPPING_MIN_PARES } from "./config";

// Faixas do manual (seção de preços). A IA nunca faz conta de preço:
// tudo passa por aqui.
const PRICE_TIERS = [
  { min: 1000, unit: 49.9 },
  { min: 500, unit: 52.9 },
  { min: 100, unit: 54.9 },
  { min: 24, unit: 57.9 },
  { min: 12, unit: 59.9 },
] as const;

export const MIN_PARES = 12;

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function unitPriceForPares(pares: number): number | null {
  if (!Number.isInteger(pares) || pares < MIN_PARES) return null;
  const tier = PRICE_TIERS.find((t) => pares >= t.min);
  return tier ? tier.unit : null;
}

export function subtotalForPares(pares: number): number | null {
  const unit = unitPriceForPares(pares);
  return unit == null ? null : roundMoney(unit * pares);
}

export function hasFreeShipping(pares: number): boolean {
  return pares >= FREE_SHIPPING_MIN_PARES;
}

/** Quantidades a partir das quais o pedido ganha algo: preço por par menor ou frete grátis. */
const ADVANTAGE_MINS = [...new Set([...PRICE_TIERS.map((t) => t.min), FREE_SHIPPING_MIN_PARES])]
  .filter((min) => min > MIN_PARES)
  .sort((a, b) => a - b);

/** "Perto" da faixa seguinte: até 30% a mais de pares (20 → 24 e 30 → 36 contam; 12 → 24 não). */
export const NEXT_ADVANTAGE_MAX_GAP_PCT = 30;

/**
 * Próxima quantidade com vantagem, quando o pedido está perto dela e ela fica
 * abaixo de `limit` (pedido grande vai para uma pessoa do time). null se não há.
 */
export function nextAdvantagePares(pares: number, limit: number): number | null {
  const next = ADVANTAGE_MINS.find((min) => min > pares);
  if (next == null || next >= limit) return null;
  return (next - pares) * 100 <= pares * NEXT_ADVANTAGE_MAX_GAP_PCT ? next : null;
}

const brl = (value: number) => `R$ ${value.toFixed(2).replace(".", ",")}`;

/** O que o cliente ganha subindo de faixa: "preço por par cai para R$ 57,90", "frete grátis" ou os dois. */
export function advantageLabel(input: {
  unitAtual: number;
  unitNovo: number;
  freteGratisAtual: boolean;
  freteGratisNovo: boolean;
}): string {
  return [
    input.unitNovo < input.unitAtual ? `preço por par cai para ${brl(input.unitNovo)}` : null,
    input.freteGratisNovo && !input.freteGratisAtual ? "frete grátis" : null,
  ]
    .filter(Boolean)
    .join(" e ");
}
