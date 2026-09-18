/**
 * Conferência da ordem de produção: o Tiny decide quanto produzir (desconta
 * o que houver em estoque), mas a regra da fábrica é produzir exatamente o
 * que foi vendido. Qualquer diferença vira alerta.
 */

export type SoldItem = { sku: string; description: string; quantity: number };

export type GeneratedItem = {
  sku: string;
  description: string;
  quantity: number;
  generated: number;
  message: string;
};

export type ProductionCheckLine = {
  sku: string;
  description: string;
  sold: number;
  generated: number | null;
  message: string;
  ok: boolean;
};

export type ProductionCheck = { ok: boolean; lines: ProductionCheckLine[] };

/** Serviços e acessos não são produzidos: nunca entram na conferência. */
export function isProducedItem(description: string) {
  return !/livro digital/i.test(description);
}

function toNumber(value: unknown) {
  const number = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) ? number : 0;
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

type TinyV2Item = {
  codigo?: unknown;
  descricao?: unknown;
  quantidade?: unknown;
  quantidade_gerada?: unknown;
  mensagem?: unknown;
};

/** A v2 do Tiny ora devolve `[{ item: {...} }]`, ora a lista direta. */
export function parseGeneratedItems(itens: unknown): GeneratedItem[] {
  const list = Array.isArray(itens) ? itens : itens && typeof itens === "object" ? [itens] : [];
  return list.map((entry) => {
    const item = ((entry as { item?: TinyV2Item }).item ?? entry) as TinyV2Item;
    return {
      sku: String(item.codigo ?? "").trim(),
      description: String(item.descricao ?? "").trim(),
      quantity: toNumber(item.quantidade),
      generated: toNumber(item.quantidade_gerada),
      message: String(item.mensagem ?? "").trim(),
    };
  });
}

type Bucket = { sku: string; description: string; sold: number; generated: number; message: string; matched: boolean };

/**
 * A v3 nem sempre traz o SKU do item do pedido, e a v2 sempre traz o código:
 * por isso o pareamento tenta o SKU e cai para a descrição do produto.
 */
export function checkProductionOrder(sold: SoldItem[], generated: GeneratedItem[]): ProductionCheck {
  const buckets: Bucket[] = [];
  const bySku = new Map<string, Bucket>();
  const byDescription = new Map<string, Bucket>();

  for (const item of sold) {
    if (!(item.quantity > 0) || !isProducedItem(item.description)) continue;
    const existing = (item.sku && bySku.get(item.sku)) || byDescription.get(normalize(item.description));
    if (existing) {
      existing.sold += item.quantity;
      continue;
    }
    const bucket: Bucket = { sku: item.sku, description: item.description, sold: item.quantity, generated: 0, message: "", matched: false };
    buckets.push(bucket);
    if (item.sku) bySku.set(item.sku, bucket);
    if (item.description) byDescription.set(normalize(item.description), bucket);
  }

  for (const item of generated) {
    const bucket = (item.sku && bySku.get(item.sku)) || byDescription.get(normalize(item.description));
    if (bucket) {
      bucket.generated += item.generated;
      bucket.matched = true;
      if (item.message) bucket.message = item.message;
      continue;
    }
    // O Tiny devolve todos os itens do pedido, inclusive os que ele mesmo
    // recusa por não serem fabricados. Sem par no pedido e sem nada gerado,
    // não é divergência: é um item que nunca deveria produzir.
    if (item.generated === 0 || !isProducedItem(item.description)) continue;
    buckets.push({ sku: item.sku, description: item.description, sold: 0, generated: item.generated, message: item.message || "Item não consta no pedido.", matched: true });
  }

  const lines = buckets.map((bucket) => ({
    sku: bucket.sku,
    description: bucket.description,
    sold: bucket.sold,
    generated: bucket.matched ? bucket.generated : null,
    message: bucket.matched ? bucket.message : "Item não apareceu na ordem de produção.",
    ok: bucket.matched && bucket.generated === bucket.sold,
  }));

  return { ok: lines.length > 0 && lines.every((line) => line.ok), lines };
}
