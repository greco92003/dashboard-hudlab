import type { GhlCustomFieldDef, GhlOpportunity } from "@/lib/ghl/api";

export type ErpOrderSource = {
  expectedPairs: number | null;
  unitPrice: number | null;
  customerFreight: number | null;
  paymentRaw: string;
  paymentKind: "pix" | "credit_card" | "other";
  dueDate: string | null;
};

function fieldValue(entry: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(entry)) {
    if (!key.startsWith("fieldValue") || value === null || value === undefined) continue;
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }
  return null;
}

function money(value: string | null): number | null {
  if (!value?.trim()) return null;
  const cleaned = value.trim().replace(/[^\d,.-]/g, "");
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function paymentKind(value: string): ErpOrderSource["paymentKind"] {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/pix/i.test(normalized)) return "pix";
  if (/cartao|credito/i.test(normalized)) return "credit_card";
  return "other";
}

export function dateFromOpportunityName(name: string): string | null {
  const br = name.match(/(?:^|\D)(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})(?:\D|$)/);
  if (br) {
    const [, day, month, year] = br;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const iso = name.match(/(?:^|\D)(\d{4})-(\d{2})-(\d{2})(?:\D|$)/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

export function extractGhlOrderSource(
  opportunity: GhlOpportunity,
  definitions: GhlCustomFieldDef[],
): ErpOrderSource {
  const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]));
  const values = new Map<string, string>();
  for (const entry of opportunity.customFields ?? []) {
    const definition = definitionsById.get(entry.id);
    const value = fieldValue(entry);
    if (!definition || value === null) continue;
    values.set(definition.fieldKey.split(".").pop() ?? definition.fieldKey, value);
  }
  const paymentRaw = values.get("forma_de_pagamento")?.trim() ?? "";
  const normalizedPayment = paymentKind(paymentRaw);
  return {
    expectedPairs: money(values.get("nmero_quantidade_de_pares") ?? values.get("quantidade_de_pares") ?? null),
    unitPrice: money(values.get("valor_unitario_do_par") ?? null),
    customerFreight: money(values.get("valor_do_frete_pago_cliente") ?? null),
    paymentRaw,
    paymentKind: normalizedPayment,
    // Pix has no reliable due date in GHL. It must be explicitly confirmed by
    // the operator instead of being inferred from the opportunity name.
    dueDate: normalizedPayment === "pix" ? null : dateFromOpportunityName(opportunity.name ?? ""),
  };
}

export const TINY_NATURE_OPTIONS = [
  "Venda de mercadorias - Consumidor final - Rio grande do Sul",
  "Venda de Mercadorias - Consumidor final - (PA,AC,AM,BA,GO)",
  "Venda de mercadorias - Consumidor final - Outros estados",
  "Remessa de Amostra Grátis",
] as const;

export const FREE_SAMPLE_NATURE = "Remessa de Amostra Grátis" as const;

const GROUPED_STATES = new Set(["PA", "AC", "AM", "BA", "GO"]);

export function natureName(state: string): (typeof TINY_NATURE_OPTIONS)[number] {
  const normalizedState = state.trim().toUpperCase();
  if (normalizedState === "RS") return TINY_NATURE_OPTIONS[0];
  if (GROUPED_STATES.has(normalizedState)) return TINY_NATURE_OPTIONS[1];
  return TINY_NATURE_OPTIONS[2];
}
