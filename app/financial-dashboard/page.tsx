"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { SummaryCards } from "@/components/financial-dashboard/summary-cards";
import { FinancialComposedChart } from "@/components/financial-dashboard/financial-composed-chart";
import { AccountsPayableTable } from "@/components/financial-dashboard/accounts-payable-table";
import { AccountsReceivableTable } from "@/components/financial-dashboard/accounts-receivable-table";
import {
  FinancialFilters,
  type FinancialFilterState,
} from "@/components/financial-dashboard/financial-filters";
import { Link, Wallet } from "lucide-react";
import type {
  FinancialDashboardSummaryResponse,
  FinancialPayable,
  FinancialReceivable,
  FinancialTimelinePoint,
} from "@/lib/tiny/types";

// -------------------------------------------------------------------------
// Build timeline points client-side from already-fetched payables/receivables.
// This ensures the chart always uses the SAME data as the tables.
// -------------------------------------------------------------------------
function buildTimelinePoints(
  payables: FinancialPayable[],
  receivables: FinancialReceivable[],
  granularity: FinancialFilterState["granularity"],
): FinancialTimelinePoint[] {
  const parseParts = (dateStr: string) => {
    if (!dateStr) return null;
    if (dateStr.includes("-")) {
      const [y, m, d] = dateStr.split("-");
      return { year: y, month: m, day: d };
    }
    const [d, m, y] = dateStr.split("/");
    return { year: y, month: m, day: d };
  };

  const periodInfo = (dateStr: string): { sortKey: string; label: string } => {
    if (!dateStr) return { sortKey: "0000-00-00", label: "Sem data" };
    const parts = parseParts(dateStr);
    if (!parts) return { sortKey: "0000-00-00", label: "Sem data" };
    const { year, month, day } = parts;
    if (granularity === "day") {
      return {
        sortKey: `${year}-${month}-${day}`,
        label: `${day}/${month}/${year}`,
      };
    }
    if (granularity === "week") {
      const d2 = new Date(Number(year), Number(month) - 1, Number(day));
      const week = Math.ceil(d2.getDate() / 7);
      return {
        sortKey: `${year}-${month}-W${String(week).padStart(2, "0")}`,
        label: `Sem ${week} ${month}/${year}`,
      };
    }
    return { sortKey: `${year}-${month}`, label: `${month}/${year}` };
  };

  type Bucket = FinancialTimelinePoint & { _sortKey: string };
  const empty = (label: string, sortKey: string): Bucket => ({
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
  });

  const pointMap = new Map<string, Bucket>();
  const bucketFor = (date: string): Bucket => {
    const { sortKey, label } = periodInfo(date);
    let b = pointMap.get(sortKey);
    if (!b) {
      b = empty(label, sortKey);
      pointMap.set(sortKey, b);
    }
    return b;
  };

  for (const p of payables) {
    if (p.status === "canceled") continue;
    const b = bucketFor(p.dueDate);
    b.payable += p.amount;
    if (p.status === "paid") b.realizedOut += p.amount;
    else b.predictedOut += p.amount;
  }

  for (const r of receivables) {
    if (r.status === "canceled") continue;
    const b = bucketFor(r.dueDate);
    b.receivable += r.amount;
    if (r.status === "received") b.realizedIn += r.amount;
    else b.predictedIn += r.amount;
  }

  const sorted = Array.from(pointMap.values()).sort((a, b) =>
    a._sortKey.localeCompare(b._sortKey),
  );

  let runningAll = 0;
  let runningRealized = 0;
  return sorted.map(({ _sortKey: _, ...rest }) => {
    runningAll += rest.receivable - rest.payable;
    runningRealized += rest.realizedIn - rest.realizedOut;
    return {
      ...rest,
      cashBalance: runningAll,
      realizedBalance: runningRealized,
    };
  });
}

// -------------------------------------------------------------------------
// Default filter: last 6 months (monthly granularity needs multiple points)
// -------------------------------------------------------------------------
function defaultFilters(): FinancialFilterState {
  const now = new Date();
  const endY = now.getFullYear();
  const endM = now.getMonth(); // 0-indexed
  const lastDay = new Date(endY, endM + 1, 0).getDate();

  // Start: first day of 5 months ago (gives 6 months total including current)
  const startDate = new Date(endY, endM - 5, 1);
  const startY = startDate.getFullYear();
  const startM = String(startDate.getMonth() + 1).padStart(2, "0");

  return {
    startDate: `${startY}-${startM}-01`,
    endDate: `${endY}-${String(endM + 1).padStart(2, "0")}-${lastDay}`,
    status: "all",
    granularity: "month",
    viewMode: "both",
  };
}

function buildQS(
  filters: FinancialFilterState,
  extra?: Record<string, string>,
) {
  const p = new URLSearchParams();
  if (filters.startDate) p.set("startDate", filters.startDate);
  if (filters.endDate) p.set("endDate", filters.endDate);
  if (filters.status && filters.status !== "all")
    p.set("status", filters.status);
  if (extra) Object.entries(extra).forEach(([k, v]) => p.set(k, v));
  return p.toString();
}

// -------------------------------------------------------------------------
// Auto-granularity: pick the best granularity for a given date range
// -------------------------------------------------------------------------
function autoGranularity(
  startDate: string,
  endDate: string,
): FinancialFilterState["granularity"] {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffDays = Math.ceil(
    (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays <= 31) return "day";
  if (diffDays <= 90) return "week";
  return "month";
}

// -------------------------------------------------------------------------
// Page
// -------------------------------------------------------------------------
export default function FinancialDashboardPage() {
  const [filters, setFilters] = useState<FinancialFilterState>(defaultFilters);
  const [summary, setSummary] = useState<FinancialDashboardSummaryResponse>();
  const [timeline, setTimeline] = useState<FinancialTimelinePoint[]>();
  const [payables, setPayables] = useState<FinancialPayable[]>();
  const [receivables, setReceivables] = useState<FinancialReceivable[]>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  // When dates change → auto-adjust granularity.
  // When granularity is explicitly changed by the user → keep it as-is.
  const handleFilterChange = useCallback(
    (next: FinancialFilterState) => {
      const datesChanged =
        next.startDate !== filters.startDate ||
        next.endDate !== filters.endDate;
      const granularityExplicitlyChanged =
        next.granularity !== filters.granularity;

      if (
        datesChanged &&
        !granularityExplicitlyChanged &&
        next.startDate &&
        next.endDate
      ) {
        setFilters({
          ...next,
          granularity: autoGranularity(next.startDate, next.endDate),
        });
      } else {
        setFilters(next);
      }
    },
    [filters.startDate, filters.endDate, filters.granularity],
  );

  // viewMode is intentionally NOT a fetch dep — it only affects display
  const { startDate, endDate, status, granularity } = filters;

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const qs = buildQS({
        startDate,
        endDate,
        status,
        granularity,
        viewMode: "both",
      });

      const [summaryRes, payablesRes, receivablesRes] = await Promise.all([
        fetch(`/api/financial-dashboard/summary?${qs}`),
        fetch(`/api/financial-dashboard/payables?${qs}`),
        fetch(`/api/financial-dashboard/receivables?${qs}`),
      ]);

      const [s, p, r] = await Promise.all([
        summaryRes.json(),
        payablesRes.json(),
        receivablesRes.json(),
      ]);

      if (!summaryRes.ok) throw new Error(s.error);

      const fetchedPayables: FinancialPayable[] = p.data ?? [];
      const fetchedReceivables: FinancialReceivable[] = r.data ?? [];

      setSummary(s);
      setPayables(fetchedPayables);
      setReceivables(fetchedReceivables);
      setTimeline(
        buildTimelinePoints(fetchedPayables, fetchedReceivables, granularity),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, status, granularity]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <h1 className="text-xl sm:text-2xl font-bold">Dashboard Financeiro</h1>

      {/* Filters */}
      <FinancialFilters
        filters={filters}
        onChange={handleFilterChange}
        onReset={() => setFilters(defaultFilters())}
      />

      {/* OAuth banner – shown for any auth-related error */}
      {error &&
        /oauth não configurado|token expirado|conectar tiny/i.test(error) && (
          <div className="rounded-xl border bg-muted/50 p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Wallet className="h-8 w-8 text-muted-foreground shrink-0" />
            <div className="flex-1">
              <p className="font-medium">
                {error.includes("expirado")
                  ? "Sessão do Tiny ERP expirada"
                  : "Conecte o Tiny ERP para ver seus dados financeiros"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {error.includes("expirado")
                  ? 'O token de acesso expirou. Clique em "Reconectar Tiny" para renovar a autorização.'
                  : 'O app Tiny está configurado. Clique em "Conectar Tiny" para autorizar o acesso.'}
              </p>
            </div>
            <Button asChild>
              <a href="/api/financial-dashboard/oauth">
                <Link className="h-4 w-4 mr-2" />
                {error.includes("expirado")
                  ? "Reconectar Tiny"
                  : "Conectar Tiny"}
              </a>
            </Button>
          </div>
        )}

      {/* Generic error banner */}
      {error &&
        !/oauth não configurado|token expirado|conectar tiny/i.test(error) && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

      {/* Summary cards */}
      <SummaryCards
        data={summary}
        loading={loading}
        viewMode={filters.viewMode}
      />

      {/* Composed chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Fluxo de Caixa — Previsto e Realizado
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FinancialComposedChart
            data={timeline}
            loading={loading}
            viewMode={filters.viewMode}
          />
        </CardContent>
      </Card>

      {/* Tables */}
      <Tabs defaultValue="payables">
        <TabsList>
          <TabsTrigger value="payables">Contas a Pagar</TabsTrigger>
          <TabsTrigger value="receivables">Contas a Receber</TabsTrigger>
        </TabsList>
        <TabsContent value="payables" className="mt-4">
          <AccountsPayableTable data={payables} loading={loading} />
        </TabsContent>
        <TabsContent value="receivables" className="mt-4">
          <AccountsReceivableTable data={receivables} loading={loading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
