export type TinyCreatedProductResponse = {
  id: number;
  codigo?: string | null;
  descricao?: string | null;
  variacoes?: Array<{
    id: number;
    codigo?: string | null;
    descricao?: string | null;
  }>;
};

type TinyVariationDraft = {
  id?: number;
  sku?: string | null;
  descricao?: string | null;
  [key: string]: unknown;
};

type TinyProductDraft = {
  sku?: string | null;
  descricao?: string | null;
  variacoes?: TinyVariationDraft[];
  [key: string]: unknown;
};

function normalizedSku(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? "";
}

export function mergeTinyCreatedProductResponse<T extends TinyProductDraft>(
  draft: T,
  response: TinyCreatedProductResponse,
): T & { id: number } {
  const createdBySku = new Map(
    (response.variacoes ?? []).flatMap((variation) => {
      const sku = normalizedSku(variation.codigo);
      return sku ? [[sku, variation] as const] : [];
    }),
  );

  return {
    ...draft,
    id: response.id,
    sku: draft.sku ?? response.codigo,
    descricao: draft.descricao ?? response.descricao,
    variacoes: (draft.variacoes ?? []).map((variation) => {
      const created = createdBySku.get(normalizedSku(variation.sku));
      return created
        ? { ...variation, id: created.id, descricao: variation.descricao ?? created.descricao }
        : variation;
    }),
  };
}