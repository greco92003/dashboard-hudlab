/**
 * Etiqueta de produção: o que vai colado no lote de cada numeração.
 * O Tiny imprime só a descrição do produto; aqui ela é quebrada em partes
 * para dar destaque ao modelo e ao tamanho.
 */

export type ProductionLabel = {
  /** Descrição completa, usada quando o nome não segue o padrão. */
  description: string;
  kind: string;
  code: string;
  model: string;
  color: string;
  size: string;
  parsed: boolean;
};

export type LabelSourceItem = { description: string; quantity: number };

const SIZE_PATTERN = /^(?:tamanho\s*:?\s*)?(\d{2}\s*\/\s*\d{2}|\d{2})$/i;

/** "Chinelo Slide Infantil 072601 - FIFTY FIGHT - Preto - 28/29" */
export function parseLabelDescription(raw: string): ProductionLabel {
  const description = raw.replace(/\s+/g, " ").trim();
  const fallback: ProductionLabel = { description, kind: "", code: "", model: "", color: "", size: "", parsed: false };
  const head = description.match(/^(.*?)\s*\b(\d{4,})\s*[-–]\s*(.+)$/);
  if (!head) return fallback;

  const parts = head[3].split(/\s+[-–]\s+|\s*[-–]\s*$/).map((part) => part.trim()).filter(Boolean);
  const sizeMatch = parts.at(-1)?.match(SIZE_PATTERN);
  if (!sizeMatch || parts.length < 3) return fallback;

  return {
    description,
    kind: head[1].trim(),
    code: head[2],
    model: parts.slice(0, -2).join(" - "),
    color: parts.at(-2) ?? "",
    size: sizeMatch[1].replace(/\s/g, ""),
    parsed: true,
  };
}

function sizeSortKey(label: ProductionLabel) {
  const first = Number(label.size.match(/\d+/)?.[0]);
  return Number.isFinite(first) ? first : Number.MAX_SAFE_INTEGER;
}

/** Uma etiqueta por item (numeração); itens repetidos no pedido viram uma só. */
export function buildProductionLabels(items: LabelSourceItem[]): ProductionLabel[] {
  const seen = new Map<string, ProductionLabel>();
  for (const item of items) {
    const description = item.description.trim();
    if (!description || !(item.quantity > 0)) continue;
    // Livro Digital e outros serviços entram no pedido, mas não na produção.
    if (/livro digital/i.test(description)) continue;
    const label = parseLabelDescription(description);
    if (!seen.has(label.description)) seen.set(label.description, label);
  }
  return [...seen.values()].sort((a, b) =>
    `${a.kind} ${a.code} ${a.model} ${a.color}`.localeCompare(`${b.kind} ${b.code} ${b.model} ${b.color}`, "pt-BR")
    || sizeSortKey(a) - sizeSortKey(b)
    || a.description.localeCompare(b.description, "pt-BR"));
}
