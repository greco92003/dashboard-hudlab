export type ErpGradeItem = {
  size: string;
  quantity: number;
  audience: "adulto" | "infantil";
};

const COLOR_ABBREVIATIONS: Record<string, string> = {
  AMARELO: "AMR",
  AZUL: "AZL",
  BEGE: "BGE",
  BRANCO: "BRC",
  CINZA: "CNZ",
  LARANJA: "LRJ",
  MARROM: "MRM",
  PRETO: "PRT",
  ROSA: "RSA",
  ROXO: "RXO",
  VERDE: "VRD",
  VERMELHO: "VRM",
};

export function normalizeSkuPart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function normalizeColorName(value: string): string {
  const normalized = normalizeSkuPart(value);
  const masculine: Record<string, string> = {
    AMARELA: "Amarelo",
    BRANCA: "Branco",
    CINZA: "Cinza",
    LARANJA: "Laranja",
    MARROM: "Marrom",
    PRETA: "Preto",
    ROSA: "Rosa",
    ROXA: "Roxo",
    VERDE: "Verde",
    VERMELHA: "Vermelho",
  };
  if (masculine[normalized]) return masculine[normalized];
  if (!normalized) return "";
  return `${normalized.charAt(0)}${normalized.slice(1).toLowerCase()}`;
}

export function inferUpperColorFromCloner(description: string): string {
  const upper = description.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const gaspea = upper.match(/GASPEA\s*\(([^)]+)\)/i)?.[1];
  if (gaspea) return normalizeColorName(gaspea);

  const ending = upper.match(/-\s*(PRET[AO]|BRANC[AO]|AZUL|VERDE|ROSA|ROX[AO])(?:\s*\(|\s*$)/i)?.[1];
  return ending ? normalizeColorName(ending) : "";
}

export function abbreviateColor(color: string): string {
  const normalized = normalizeSkuPart(normalizeColorName(color));
  return COLOR_ABBREVIATIONS[normalized] ?? normalized.slice(0, 3);
}

export function buildModelCode(date: Date, modelNumber: number): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  const model = String(modelNumber).padStart(2, "0");
  return `${month}${year}${model}`;
}

export function buildProductTitle(input: {
  opportunityName: string;
  color: string;
  modelNumber: number;
  date: Date;
}): string {
  const opportunity = input.opportunityName.trim().toUpperCase();
  const color = normalizeColorName(input.color);
  return `Chinelo Slide ${buildModelCode(input.date, input.modelNumber)} - ${opportunity} - ${color}`;
}

export function buildBaseSku(opportunityName: string, color: string): string {
  return `CH-SL-${normalizeSkuPart(opportunityName)}-${abbreviateColor(color)}`;
}

export function buildVariationSku(baseSku: string, size: string): string {
  return `${normalizeSkuPart(baseSku)}-${size.replace(/\D/g, "")}`;
}

export function positiveQuantity(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
