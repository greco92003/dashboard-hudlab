import type { GhlProductModel } from "./ghl-product-models";

type ProductForMatch = {
  reference: string;
  sizes: Array<{ size: string; quantity: number }>;
};

function sameGrade(model: GhlProductModel, sizes: ProductForMatch["sizes"]) {
  if (model.grades.length !== sizes.length) return false;
  const expected = new Map(model.grades.map((grade) => [grade.size.replace(/\s/g, ""), grade.quantity]));
  return sizes.every((entry) => Math.abs((expected.get(entry.size.replace(/\s/g, "")) ?? -1) - entry.quantity) < 0.001);
}

/**
 * Qual modelo da ficha do GHL corresponde a um produto do pedido no Tiny.
 *
 * O código MMAANN do nome NÃO é confiável: produtos criados à mão no Tiny e
 * reaproveitados no modo "usar produto existente" têm a numeração de quem os
 * criou. No pedido 1983 (DOG DOOR) o "082603 - Branco" era o Modelo 1 do GHL e
 * o "082601 - Preto" era o Modelo 3, e o talão trocou as fotos.
 *
 * A ligação que não mente é a grade: o pedido é montado a partir das grades do
 * GHL, então numerações e quantidades do produto batem com as do seu modelo.
 * Só quando a grade não decide (empate ou ficha alterada) o código do nome e o
 * modelo único do público servem de desempate.
 */
export function matchGhlModel(product: ProductForMatch, models: GhlProductModel[]) {
  const audience = /infantil/i.test(product.reference) ? "infantil" : "adulto";
  const sameAudience = models.filter((model) => model.audience === audience);

  const byGrade = sameAudience.filter((model) => sameGrade(model, product.sizes));
  if (byGrade.length === 1) return byGrade[0];

  const candidates = byGrade.length > 1 ? byGrade : sameAudience;
  const code = product.reference.match(/Chinelo Slide(?: Infantil)? (\d{6})\b/i)?.[1];
  if (code) {
    const byCode = candidates.find((model) => model.modelNumber === Number(code.slice(4)));
    if (byCode) return byCode;
  }
  return candidates.length === 1 ? candidates[0] : null;
}
