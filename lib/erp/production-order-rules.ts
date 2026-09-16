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

function toNumber(value: unknown) {
  const number = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) ? number : 0;
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

function sumBySku<T extends { sku: string }>(items: T[], value: (item: T) => number) {
  const totals = new Map<string, { item: T; total: number }>();
  for (const item of items) {
    const key = item.sku || `desc:${(item as { description?: string }).description ?? ""}`;
    const current = totals.get(key);
    totals.set(key, { item: current?.item ?? item, total: (current?.total ?? 0) + value(item) });
  }
  return totals;
}

export function checkProductionOrder(sold: SoldItem[], generated: GeneratedItem[]): ProductionCheck {
  const soldTotals = sumBySku(
    sold.filter((item) => item.quantity > 0 && !/livro digital/i.test(item.description)),
    (item) => item.quantity,
  );
  const generatedTotals = sumBySku(generated, (item) => item.generated);
  const lines: ProductionCheckLine[] = [];

  for (const [key, { item, total }] of soldTotals) {
    const match = generatedTotals.get(key);
    const generatedQuantity = match?.total ?? null;
    lines.push({
      sku: item.sku,
      description: item.description,
      sold: total,
      generated: generatedQuantity,
      message: match?.item.message ?? (match ? "" : "Item não apareceu na ordem de produção."),
      ok: generatedQuantity === total,
    });
  }
  for (const [key, { item, total }] of generatedTotals) {
    if (soldTotals.has(key)) continue;
    lines.push({ sku: item.sku, description: item.description, sold: 0, generated: total, message: item.message || "Item não consta no pedido.", ok: false });
  }

  return { ok: lines.length > 0 && lines.every((line) => line.ok), lines };
}
