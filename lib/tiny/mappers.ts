/**
 * Tiny/Olist response mappers.
 *
 * Handles both V2 (token) and V3 (OAuth2) response shapes.
 * V3 fields confirmed at https://api-docs.erp.olist.com
 */

import type {
  FinancialPayable,
  FinancialReceivable,
  TinyRawContaPagar,
  TinyRawContaReceber,
  TinyV3RawContaPagar,
  TinyV3RawContaReceber,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toNumber(value: string | number | null | undefined): number {
  if (value === undefined || value === null || value === "") return 0;
  const n =
    typeof value === "string" ? parseFloat(value.replace(",", ".")) : value;
  return isNaN(n) ? 0 : n;
}

/**
 * Maps V2 and V3 `situacao` values to internal status.
 * V3 payable statuses: "aberto" | "cancelada" | "pago" | "parcial" | "prevista" | "atrasadas" | "emissao"
 * V3 receivable statuses: "aberto" | "cancelada" | "recebido" | "parcial" | "prevista" | "atrasadas"
 */
function mapStatus(
  raw: string | undefined,
  direction: "pagar" | "receber",
): FinancialPayable["status"] | FinancialReceivable["status"] {
  const s = (raw ?? "").toLowerCase();
  if (s === "pago" || s === "recebido")
    return direction === "pagar" ? "paid" : "received";
  if (s === "cancelada" || s === "cancelado") return "canceled";
  if (s === "parcial") return "partial";
  if (s === "vencido" || s === "atrasado" || s === "atrasadas")
    return "overdue";
  // "aberto", "prevista", "emissao" → open
  return "open";
}

// ---------------------------------------------------------------------------
// V2 mappers (token auth – legacy/fallback)
// ---------------------------------------------------------------------------

export function mapContaPagar(raw: TinyRawContaPagar): FinancialPayable {
  return {
    id: String(raw.id),
    description: raw.descricao ?? "Sem descrição",
    dueDate: raw.vencimento ?? "",
    amount: toNumber(raw.valor),
    status: mapStatus(raw.situacao, "pagar") as FinancialPayable["status"],
    category: {
      id: raw.idCategoria ? String(raw.idCategoria) : undefined,
      name: raw.categoria ?? "Sem categoria",
    },
    supplier: raw.nomeContato
      ? {
          id: raw.idContato ? String(raw.idContato) : undefined,
          name: raw.nomeContato,
        }
      : undefined,
  };
}

export function mapContasPagar(
  rawList: TinyRawContaPagar[],
): FinancialPayable[] {
  return rawList.map(mapContaPagar);
}

export function mapContaReceber(raw: TinyRawContaReceber): FinancialReceivable {
  return {
    id: String(raw.id),
    description: raw.descricao ?? "Sem descrição",
    dueDate: raw.vencimento ?? "",
    amount: toNumber(raw.valor),
    status: mapStatus(raw.situacao, "receber") as FinancialReceivable["status"],
    customer: raw.nomeContato
      ? {
          id: raw.idContato ? String(raw.idContato) : undefined,
          name: raw.nomeContato,
        }
      : undefined,
    receiptMethod: raw.formaPagamento,
  };
}

export function mapContasReceber(
  rawList: TinyRawContaReceber[],
): FinancialReceivable[] {
  return rawList.map(mapContaReceber);
}

// ---------------------------------------------------------------------------
// V3 mappers (OAuth2 Bearer – preferred)
// ---------------------------------------------------------------------------

export function mapV3ContaPagar(raw: TinyV3RawContaPagar): FinancialPayable {
  return {
    id: String(raw.id),
    description: raw.historico ?? raw.numeroDocumento ?? "Sem descrição",
    dueDate: raw.dataVencimento ?? raw.data ?? "",
    amount: toNumber(raw.valor),
    status: mapStatus(raw.situacao, "pagar") as FinancialPayable["status"],
    supplier: raw.cliente?.nome
      ? {
          id: raw.cliente.id ? String(raw.cliente.id) : undefined,
          name: raw.cliente.nome,
        }
      : undefined,
  };
}

export function mapV3ContasPagar(
  rawList: TinyV3RawContaPagar[],
): FinancialPayable[] {
  return rawList.map(mapV3ContaPagar);
}

export function mapV3ContaReceber(
  raw: TinyV3RawContaReceber,
): FinancialReceivable {
  return {
    id: String(raw.id),
    description: raw.historico ?? raw.numeroDocumento ?? "Sem descrição",
    dueDate: raw.dataVencimento ?? raw.data ?? "",
    amount: toNumber(raw.valor),
    status: mapStatus(raw.situacao, "receber") as FinancialReceivable["status"],
    customer: raw.cliente?.nome
      ? {
          id: raw.cliente.id ? String(raw.cliente.id) : undefined,
          name: raw.cliente.nome,
        }
      : undefined,
  };
}

export function mapV3ContasReceber(
  rawList: TinyV3RawContaReceber[],
): FinancialReceivable[] {
  return rawList.map(mapV3ContaReceber);
}
