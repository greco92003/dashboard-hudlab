import type { TinyClonerDetail } from "./tiny-product-cloner";

type TinyVariation = NonNullable<TinyClonerDetail["variacoes"]>[number];

export type TinyManufacturingPair = {
  target: TinyClonerDetail;
  source: TinyVariation;
};

function variationSize(variation: TinyVariation) {
  return variation.grade?.find((item) =>
    /tamanho|numera|grade/i.test(item.chave?.trim() ?? ""),
  )?.valor?.trim() || variation.grade?.[0]?.valor?.trim();
}

function tinyV2Price(value: number | null | undefined) {
  if (!Number.isFinite(value) || value == null || value <= 0) {
    throw new Error("A variação não possui um preço positivo para envio ao Tiny.");
  }
  return value.toFixed(2);
}

function tinyV2Decimal(value: number | null | undefined) {
  return Number.isFinite(value) && value != null ? value.toFixed(3) : undefined;
}

export function prepareTinyManufacturedVariations(
  product: TinyClonerDetail,
  cloner: TinyClonerDetail,
  unitPrice?: number,
) {
  const targetBySize = new Map(
    (product.variacoes ?? []).flatMap((variation) => {
      const size = variationSize(variation);
      return size ? [[size, variation] as const] : [];
    }),
  );
  const pairs: TinyManufacturingPair[] = [];
  const sizes: string[] = [];

  for (const source of cloner.variacoes ?? []) {
    if (source.tipo !== "F") continue;
    const size = variationSize(source);
    const targetVariation = size ? targetBySize.get(size) : undefined;
    if (!size || !targetVariation?.id || !targetVariation.sku?.trim()) {
      throw new Error(
        `Não foi possível relacionar a variação fabricada ${size ?? source.sku ?? "do cloner"}.`,
      );
    }
    if (targetVariation.tipo === "F") continue;

    pairs.push({
      source,
      target: {
        ...product,
        ...targetVariation,
        id: targetVariation.id,
        sku: targetVariation.sku,
        descricao: targetVariation.descricao?.trim()
          || `${product.descricao?.trim() || product.sku?.trim() || "Produto"} ${size}`,
        precos: {
          ...(targetVariation.precos ?? product.precos),
          ...(unitPrice != null ? { preco: unitPrice } : {}),
        },
        dimensoes: source.dimensoes ?? targetVariation.dimensoes ?? product.dimensoes,
        grade: targetVariation.grade,
        variacoes: undefined,
      },
    });
    sizes.push(size);
  }

  return { pairs, sizes };
}

export function buildTinyV2ManufacturedProduct(
  pair: TinyManufacturingPair,
  sequence: number,
) {
  const { target, source } = pair;
  if (!target.id || !target.sku?.trim() || !target.descricao?.trim()) {
    throw new Error("O Tiny não retornou os dados necessários da variação criada.");
  }
  const structure = (source.producao?.produtos ?? []).flatMap((item) =>
    item.produto?.id && item.quantidade != null
      ? [{ item: {
          id_produto: item.produto.id,
          descricao: item.produto.descricao?.trim()
            || item.produto.sku?.trim()
            || "Componente",
          quantidade: item.quantidade,
        } }]
      : [],
  );
  const stages = (source.producao?.etapas ?? [])
    .filter((name): name is string => Boolean(name?.trim()))
    .map((name) => ({ etapa: { nome: name.trim() } }));
  if (structure.length === 0 && stages.length === 0) {
    throw new Error(
      `A variação ${source.sku ?? source.id ?? "do cloner"} é Fabricada, mas não possui estrutura ou etapa de produção.`,
    );
  }
  const netWeight = tinyV2Decimal(target.dimensoes?.pesoLiquido);
  const grossWeight = tinyV2Decimal(target.dimensoes?.pesoBruto);

  return {
    produto: {
      sequencia: sequence,
      id: target.id,
      codigo: target.sku.trim(),
      nome: target.descricao.trim(),
      unidade: target.unidade?.trim() || "PR",
      preco: tinyV2Price(target.precos?.preco ?? source.precos?.preco),
      ncm: target.ncm?.trim() ?? "",
      origem: String(target.origem ?? 0),
      ...(netWeight !== undefined ? { peso_liquido: netWeight } : {}),
      ...(grossWeight !== undefined ? { peso_bruto: grossWeight } : {}),
      situacao: "A",
      tipo: "P",
      classe_produto: "F",
      grade: Object.fromEntries(
        (target.grade ?? []).flatMap((item) =>
          item.chave?.trim() && item.valor?.trim()
            ? [[item.chave.trim(), item.valor.trim()]]
            : [],
        ),
      ),
      estrutura: structure,
      etapas: stages,
    },
  };
}
