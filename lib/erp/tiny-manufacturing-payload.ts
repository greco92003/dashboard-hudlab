import type { TinyClonerDetail } from "./tiny-product-cloner";

type TinyVariation = NonNullable<TinyClonerDetail["variacoes"]>[number];

export type TinyManufacturingPair = {
  target: TinyClonerDetail;
  source: TinyVariation;
};

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

  return {
    produto: {
      sequencia: sequence,
      id: target.id,
      codigo: target.sku.trim(),
      nome: target.descricao.trim(),
      unidade: target.unidade?.trim() || "PR",
      preco: target.precos?.preco ?? 0,
      ncm: target.ncm?.trim() ?? "",
      origem: String(target.origem ?? 0),
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
