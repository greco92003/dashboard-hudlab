/**
 * Tiny/Olist service layer.
 *
 * Business-level functions ready to be consumed by Next.js route handlers.
 * All calls happen server-side – credentials are never exposed to the client.
 */

import { tinyGet } from "./client";
import { getAuthMode } from "./auth";
import {
  mapContasPagar,
  mapContasReceber,
  mapV3ContasPagar,
  mapV3ContasReceber,
} from "./mappers";
import type {
  FinancialPayable,
  FinancialReceivable,
  FinancialCashBalance,
  FinancialTimelinePoint,
  FinancialDashboardSummaryResponse,
  FinancialDashboardTimelineResponse,
  FinancialFilters,
  TinyV3RawContaPagar,
  TinyV3RawContaReceber,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds query-string params for the Tiny API.
 * V2 uses `dataInicial`/`dataFinal`; V3 uses `dataInicialVencimento`/`dataFinalVencimento`.
 */
function buildDateParams(filters: FinancialFilters): Record<string, string> {
  const mode = getAuthMode();
  const p: Record<string, string> = {};

  if (mode === "v3-oauth") {
    if (filters.startDate) p["dataInicialVencimento"] = filters.startDate;
    if (filters.endDate) p["dataFinalVencimento"] = filters.endDate;
    if (filters.status && filters.status !== "all")
      p["situacao"] = filters.status;
    p["limit"] = "100";
  } else {
    if (filters.startDate) p["dataInicial"] = filters.startDate;
    if (filters.endDate) p["dataFinal"] = filters.endDate;
    if (filters.status) p["situacao"] = filters.status;
  }
  return p;
}

/**
 * Extracts items from a V2 response.
 * V2 shape: { retorno: { [key]: [ { conta: {...} } ] } }
 */
function extractListV2<T>(json: unknown, key: string): T[] {
  try {
    const retorno = (json as Record<string, unknown>)?.retorno as Record<
      string,
      unknown
    >;
    const wrapper = retorno?.[key];
    if (!wrapper) return [];
    const arr = Array.isArray(wrapper) ? wrapper : [wrapper];
    return arr.map(
      (item: Record<string, unknown>) =>
        (item?.conta ?? item?.contaReceber ?? item) as T,
    );
  } catch {
    return [];
  }
}

/**
 * Extracts items from a V3 response.
 * Handles: { itens: [...] } | [...] | single object
 */
function extractListV3<T>(json: unknown): T[] {
  if (!json) return [];
  const obj = json as Record<string, unknown>;
  if (Array.isArray(obj.itens)) return obj.itens as T[];
  if (Array.isArray(json)) return json as T[];
  if (typeof obj === "object" && obj.id !== undefined) return [json as T];
  return [];
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

export async function getPayables(
  filters: FinancialFilters = {},
): Promise<FinancialPayable[]> {
  const mode = getAuthMode();
  const json = await tinyGet("contasPagar", {
    params: buildDateParams(filters),
  });

  if (mode === "v3-oauth") {
    const raw = extractListV3<TinyV3RawContaPagar>(json);
    return mapV3ContasPagar(raw);
  }
  const raw = extractListV2<Parameters<typeof mapContasPagar>[0][0]>(
    json,
    "contas",
  );
  return mapContasPagar(raw);
}

export async function getReceivables(
  filters: FinancialFilters = {},
): Promise<FinancialReceivable[]> {
  const mode = getAuthMode();
  const json = await tinyGet("contasReceber", {
    params: buildDateParams(filters),
  });

  if (mode === "v3-oauth") {
    const raw = extractListV3<TinyV3RawContaReceber>(json);
    return mapV3ContasReceber(raw);
  }
  const raw = extractListV2<Parameters<typeof mapContasReceber>[0][0]>(
    json,
    "contas",
  );
  return mapContasReceber(raw);
}

/**
 * Cash balance: derived from receivables – payables for the period.
 * Replace with a direct endpoint when Tiny V3 exposes one.
 */
export async function getCashBalance(
  filters: FinancialFilters = {},
): Promise<FinancialCashBalance> {
  const [payables, receivables] = await Promise.all([
    getPayables(filters),
    getReceivables(filters),
  ]);

  const totalPaid = payables
    .filter((p) => p.status === "paid")
    .reduce((s, p) => s + p.amount, 0);

  const totalReceived = receivables
    .filter((r) => r.status === "received")
    .reduce((s, r) => s + r.amount, 0);

  return {
    balance: totalReceived - totalPaid,
    currency: "BRL",
    referenceDate: new Date().toISOString().split("T")[0],
  };
}

export async function getSummary(
  filters: FinancialFilters = {},
): Promise<FinancialDashboardSummaryResponse> {
  const [payables, receivables, cashBalance] = await Promise.all([
    getPayables(filters),
    getReceivables(filters),
    getCashBalance(filters),
  ]);

  const totalPayable = payables.reduce((s, p) => s + p.amount, 0);
  const totalReceivable = receivables.reduce((s, r) => s + r.amount, 0);

  return {
    totalPayable,
    totalReceivable,
    cashBalance: cashBalance.balance,
    netForecast: totalReceivable - totalPayable,
  };
}

export async function getTimeline(
  filters: FinancialFilters = {},
): Promise<FinancialDashboardTimelineResponse> {
  const granularity = filters.granularity ?? "month";
  const [payables, receivables] = await Promise.all([
    getPayables(filters),
    getReceivables(filters),
  ]);

  const pointMap = new Map<string, FinancialTimelinePoint>();

  // Handles both V2 (dd/MM/yyyy) and V3 (YYYY-MM-DD) date formats
  const periodKey = (dateStr: string): string => {
    if (!dateStr) return "Sem data";
    let day: string, month: string, year: string;
    if (dateStr.includes("-")) {
      // V3 format: YYYY-MM-DD
      [year, month, day] = dateStr.split("-");
    } else {
      // V2 format: dd/MM/yyyy
      [day, month, year] = dateStr.split("/");
    }
    if (granularity === "day") return `${day}/${month}/${year}`;
    if (granularity === "week") {
      const d = new Date(Number(year), Number(month) - 1, Number(day));
      const week = Math.ceil(d.getDate() / 7);
      return `Sem ${week} ${month}/${year}`;
    }
    return `${month}/${year}`;
  };

  for (const p of payables) {
    const key = periodKey(p.dueDate);
    const point = pointMap.get(key) ?? {
      period: key,
      payable: 0,
      receivable: 0,
      cashBalance: 0,
    };
    point.payable += p.amount;
    pointMap.set(key, point);
  }

  for (const r of receivables) {
    const key = periodKey(r.dueDate);
    const point = pointMap.get(key) ?? {
      period: key,
      payable: 0,
      receivable: 0,
      cashBalance: 0,
    };
    point.receivable += r.amount;
    pointMap.set(key, point);
  }

  const points: FinancialTimelinePoint[] = Array.from(pointMap.values()).map(
    (p) => ({
      ...p,
      cashBalance: p.receivable - p.payable,
    }),
  );

  points.sort((a, b) => a.period.localeCompare(b.period));

  return { granularity, points };
}
