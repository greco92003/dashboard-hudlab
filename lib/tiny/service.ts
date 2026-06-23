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
import type { TinyEndpointKey } from "./endpoints";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const V3_PAGE_LIMIT = 100;
const V3_MAX_PAGES = 50; // safety cap → up to 5000 records per query
const V3_DETAIL_CONCURRENCY = 2; // parallel detail fetches when enriching with category (keep low to avoid 429)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds query-string params for the Tiny API.
 * V2 uses `dataInicial`/`dataFinal`; V3 uses `dataInicialVencimento`/`dataFinalVencimento`.
 * Note: `limit`/`offset` are added by `fetchAllPagesV3`, not here.
 */
function buildDateParams(filters: FinancialFilters): Record<string, string> {
  const mode = getAuthMode();
  const p: Record<string, string> = {};

  if (mode === "v3-oauth") {
    if (filters.startDate) p["dataInicialVencimento"] = filters.startDate;
    if (filters.endDate) p["dataFinalVencimento"] = filters.endDate;
    if (filters.status && filters.status !== "all")
      p["situacao"] = filters.status;
  } else {
    if (filters.startDate) p["dataInicial"] = filters.startDate;
    if (filters.endDate) p["dataFinal"] = filters.endDate;
    if (filters.status) p["situacao"] = filters.status;
  }
  return p;
}

/**
 * Loops through Tiny V3 paginated endpoints until all items are retrieved.
 * Stops when: items < limit, or offset+items >= total, or MAX_PAGES reached.
 */
async function fetchAllPagesV3<T>(
  endpointKey: TinyEndpointKey,
  baseParams: Record<string, string>,
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;

  for (let page = 0; page < V3_MAX_PAGES; page++) {
    const params = {
      ...baseParams,
      limit: String(V3_PAGE_LIMIT),
      offset: String(offset),
    };
    const json = await tinyGet(endpointKey, { params });
    const items = extractListV3<T>(json);
    all.push(...items);

    const obj = json as Record<string, unknown>;
    const paginacao = obj?.paginacao as { total?: number } | undefined;
    const total = paginacao?.total;

    if (items.length < V3_PAGE_LIMIT) break;
    if (total !== undefined && offset + items.length >= total) break;

    offset += V3_PAGE_LIMIT;
  }

  return all;
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

/**
 * Runs async tasks with a fixed concurrency. Preserves input order in the result.
 * Used to enrich Tiny V3 list items with details (categoria/marcadores) without
 * overwhelming the API (rate-limited at ~120 req/min).
 */
async function runWithConcurrency<TIn, TOut>(
  items: TIn[],
  limit: number,
  task: (item: TIn, index: number) => Promise<TOut>,
): Promise<TOut[]> {
  const results: TOut[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const idx = cursor++;
        if (idx >= items.length) return;
        results[idx] = await task(items[idx], idx);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

/**
 * V3 only: enriches list items (which lack `categoria`) by fetching each
 * record via GET /contas-pagar/{id} or /contas-receber/{id}.
 * Failures on individual fetches are swallowed so a single 4xx/5xx does not
 * break the whole listing – the affected item keeps the list-level data.
 */
async function enrichV3WithDetails<
  T extends { id: number; categoria?: { id?: number; descricao?: string } },
>(endpointKey: TinyEndpointKey, items: T[]): Promise<T[]> {
  if (items.length === 0) return items;
  return runWithConcurrency(items, V3_DETAIL_CONCURRENCY, async (item) => {
    try {
      const detail = await tinyGet<T>(endpointKey, { idPath: item.id });
      return { ...item, ...detail };
    } catch (err) {
      console.warn(
        `[Tiny] enrichV3WithDetails skipped id=${item.id}:`,
        err instanceof Error ? err.message : err,
      );
      return item;
    }
  });
}

export type GetPayablesOptions = {
  /** V3 only: fetch each item individually to populate `category` (slower). */
  withCategory?: boolean;
};

export async function getPayables(
  filters: FinancialFilters = {},
  options: GetPayablesOptions = {},
): Promise<FinancialPayable[]> {
  const mode = getAuthMode();
  const baseParams = buildDateParams(filters);

  if (mode === "v3-oauth") {
    let raw = await fetchAllPagesV3<TinyV3RawContaPagar>(
      "contasPagar",
      baseParams,
    );
    if (options.withCategory) {
      raw = await enrichV3WithDetails("contasPagar", raw);
    }
    return mapV3ContasPagar(raw);
  }
  const json = await tinyGet("contasPagar", { params: baseParams });
  const raw = extractListV2<Parameters<typeof mapContasPagar>[0][0]>(
    json,
    "contas",
  );
  return mapContasPagar(raw);
}

export async function getReceivables(
  filters: FinancialFilters = {},
  options: GetPayablesOptions = {},
): Promise<FinancialReceivable[]> {
  const mode = getAuthMode();
  const baseParams = buildDateParams(filters);

  if (mode === "v3-oauth") {
    let raw = await fetchAllPagesV3<TinyV3RawContaReceber>(
      "contasReceber",
      baseParams,
    );
    if (options.withCategory) {
      raw = await enrichV3WithDetails("contasReceber", raw);
    }
    return mapV3ContasReceber(raw);
  }
  const json = await tinyGet("contasReceber", { params: baseParams });
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
  const [payables, receivables] = await Promise.all([
    getPayables(filters),
    getReceivables(filters),
  ]);

  const totalPayable = payables.reduce((s, p) => s + p.amount, 0);
  const totalReceivable = receivables.reduce((s, r) => s + r.amount, 0);

  // Realized = already paid/received
  const totalPaid = payables
    .filter((p) => p.status === "paid")
    .reduce((s, p) => s + p.amount, 0);
  const totalReceived = receivables
    .filter((r) => r.status === "received")
    .reduce((s, r) => s + r.amount, 0);

  // Predicted = scheduled / not realized yet (excludes canceled and paid/received)
  const totalToPay = payables
    .filter((p) => p.status !== "paid" && p.status !== "canceled")
    .reduce((s, p) => s + p.amount, 0);
  const totalToReceive = receivables
    .filter((r) => r.status !== "received" && r.status !== "canceled")
    .reduce((s, r) => s + r.amount, 0);

  return {
    totalPayable,
    totalReceivable,
    cashBalance: totalReceived - totalPaid,
    netForecast: totalReceivable - totalPayable,
    totalPaid,
    totalReceived,
    realizedNet: totalReceived - totalPaid,
    totalToPay,
    totalToReceive,
    predictedNet: totalToReceive - totalToPay,
    payablesCount: payables.length,
    receivablesCount: receivables.length,
  };
}

// ---------------------------------------------------------------------------
// Timeline helpers
// ---------------------------------------------------------------------------

function parseDateParts(
  dateStr: string,
): { year: string; month: string; day: string } | null {
  if (!dateStr) return null;
  if (dateStr.includes("-")) {
    const [y, m, d] = dateStr.split("-");
    return { year: y, month: m, day: d };
  }
  const [d, m, y] = dateStr.split("/");
  return { year: y, month: m, day: d };
}

function periodInfo(
  dateStr: string,
  granularity: "day" | "week" | "month",
): { sortKey: string; label: string } {
  const parts = parseDateParts(dateStr);
  if (!parts) return { sortKey: "0000-00-00", label: "Sem data" };
  const { year, month, day } = parts;
  if (granularity === "day") {
    return {
      sortKey: `${year}-${month}-${day}`,
      label: `${day}/${month}/${year}`,
    };
  }
  if (granularity === "week") {
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    const week = Math.ceil(d.getDate() / 7);
    return {
      sortKey: `${year}-${month}-W${String(week).padStart(2, "0")}`,
      label: `Sem ${week} ${month}/${year}`,
    };
  }
  return { sortKey: `${year}-${month}`, label: `${month}/${year}` };
}

type TimelineBucket = FinancialTimelinePoint & { _sortKey: string };

function emptyBucket(label: string, sortKey: string): TimelineBucket {
  return {
    period: label,
    payable: 0,
    receivable: 0,
    realizedIn: 0,
    realizedOut: 0,
    predictedIn: 0,
    predictedOut: 0,
    cashBalance: 0,
    realizedBalance: 0,
    _sortKey: sortKey,
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

  const pointMap = new Map<string, TimelineBucket>();
  const getBucket = (date: string): TimelineBucket => {
    const { sortKey, label } = periodInfo(date, granularity);
    let b = pointMap.get(sortKey);
    if (!b) {
      b = emptyBucket(label, sortKey);
      pointMap.set(sortKey, b);
    }
    return b;
  };

  for (const p of payables) {
    if (p.status === "canceled") continue;
    const b = getBucket(p.dueDate);
    b.payable += p.amount;
    if (p.status === "paid") b.realizedOut += p.amount;
    else b.predictedOut += p.amount;
  }

  for (const r of receivables) {
    if (r.status === "canceled") continue;
    const b = getBucket(r.dueDate);
    b.receivable += r.amount;
    if (r.status === "received") b.realizedIn += r.amount;
    else b.predictedIn += r.amount;
  }

  const sorted = Array.from(pointMap.values()).sort((a, b) =>
    a._sortKey.localeCompare(b._sortKey),
  );

  let runningAll = 0;
  let runningRealized = 0;
  const points: FinancialTimelinePoint[] = sorted.map(
    ({ _sortKey: _, ...rest }) => {
      runningAll += rest.receivable - rest.payable;
      runningRealized += rest.realizedIn - rest.realizedOut;
      return {
        ...rest,
        cashBalance: runningAll,
        realizedBalance: runningRealized,
      };
    },
  );

  return { granularity, points };
}
