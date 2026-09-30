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
