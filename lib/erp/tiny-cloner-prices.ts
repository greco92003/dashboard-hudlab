type PriceHolder = {
  precos?: { preco?: number | null } | null;
};

type ClonerPriceSource = PriceHolder & {
  variacoes?: PriceHolder[] | null;
};

export function tinyClonerBasePrice(cloner: ClonerPriceSource): number {
  return tinyClonerBasePriceWithOverride(cloner);
}

function positivePrice(value: number | null | undefined) {
  return Number.isFinite(value) && value != null && value > 0 ? value : null;
}

export function tinyClonerBasePriceWithOverride(
  cloner: ClonerPriceSource,
  unitPrice?: number | null,
): number {
  return positivePrice(unitPrice)
    ?? positivePrice(cloner.precos?.preco)
    ?? cloner.variacoes
      ?.map((variation) => positivePrice(variation.precos?.preco))
      .find((price): price is number => price !== null)
    ?? 0;
}

export function tinyClonerVariationPrice(
  cloner: ClonerPriceSource,
  variation: PriceHolder,
  unitPrice?: number | null,
): number {
  return positivePrice(unitPrice)
    ?? positivePrice(variation.precos?.preco)
    ?? tinyClonerBasePriceWithOverride(cloner);
}


