type PriceHolder = {
  precos?: { preco?: number | null } | null;
};

type ClonerPriceSource = PriceHolder & {
  variacoes?: PriceHolder[] | null;
};

export function tinyClonerBasePrice(cloner: ClonerPriceSource): number {
  return cloner.precos?.preco
    ?? cloner.variacoes?.find((variation) => variation.precos?.preco != null)
      ?.precos?.preco
    ?? 0;
}

export function tinyClonerVariationPrice(
  cloner: ClonerPriceSource,
  variation: PriceHolder,
): number {
  return variation.precos?.preco ?? tinyClonerBasePrice(cloner);
}


