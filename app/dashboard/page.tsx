"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { ChartAreaGradient } from "@/components/ui/chart-area-gradient";
import { ChartBarFaturamento } from "@/components/ui/chart-bar-faturamento";
import { ChartBarCicloVendas } from "@/components/ui/chart-bar-ciclo-vendas";
import Calendar23 from "@/components/calendar-23";
import { DateRange } from "react-day-picker";
import { useGlobalDateRange } from "@/hooks/useGlobalDateRange";
import { Clock3, LayoutDashboard, Package, RefreshCw, Wallet } from "lucide-react";
import { ChartPieEstados } from "@/components/ui/chart-pie-estados";
import { ChartPieGeneric } from "@/components/ui/chart-pie-generic";
import { useManualSync } from "@/hooks/useManualSync";
import { SyncChecker } from "@/components/ui/sync-checker";
import { useDataRefresh } from "@/hooks/useDataRefresh";
import { ultimosDias } from "@/lib/periodo";
import { BarraDeFiltros, CabecalhoDaPagina, Campo, GrupoDeAcoes } from "@/components/hud/pagina";

// Define the deal type based on the new flat API response
interface Deal {
  deal_id: string;
  title: string;
  value: number;
  currency: string;
  status: string | null;
  stage_id: string | null;
  closing_date: string | null;
  created_date: string | null;
  custom_field_value: string | null; // Field ID 5 (Data Fechamento)
  custom_field_id: string | null;
  estado: string | null; // Field ID 25
  "quantidade-de-pares": string | null; // Field ID 39
  vendedor: string | null; // Field ID 45
  designer: string | null; // Field ID 47
  contact_id: string | null;
  organization_id: string | null;
  api_updated_at: string | null;
  segmento_de_negocio: string | null;
  intencao_de_compra: string | null;
  "utm-source": string | null;
  "utm-medium": string | null;
  [key: string]: string | number | null | undefined;
}

// Define chart data type
interface ChartData {
  date: string;
  revenue: number;
}

// Helper function to format date as local YYYY-MM-DD without timezone conversion
const formatDateToLocal = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Helper: shift a date back 1 year
const shiftDateOneYearBack = (date: Date): Date => {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() - 1);
  return d;
};

// Janela dos "últimos N dias" -- a MESMA definição do Meta Marketing e do
// /funil (lib/periodo.ts). O botão antigo era "Último mês" e o gráfico/ano
// anterior recuavam N *meses* de calendário, então "30 dias" aqui virava 31-32
// e o faturamento não batia com as outras telas. Ao meio-dia pra nunca virar
// de dia por fuso.
const janelaUltimosDias = (dias: number): { start: Date; end: Date } => {
  const { inicio, fim } = ultimosDias(dias);
  return {
    start: new Date(`${inicio}T12:00:00`),
    end: new Date(`${fim}T12:00:00`),
  };
};

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);

  // Use global date range hook
  const {
    dateRange,
    period,
    useCustomPeriod,
    isHydrated,
    handleDateRangeChange,
    handlePeriodChange,
  } = useGlobalDateRange();

  // Deals data
  const [deals, setDeals] = useState<Deal[]>([]);
  const [totalValue, setTotalValue] = useState(0);
  const [totalPairsSold, setTotalPairsSold] = useState(0);

  // Previous year data
  const [prevDeals, setPrevDeals] = useState<Deal[]>([]);
  const [prevTotalValue, setPrevTotalValue] = useState(0);
  const [prevTotalPairsSold, setPrevTotalPairsSold] = useState(0);
  const [prevChartData, setPrevChartData] = useState<ChartData[]>([]);

  // Chart data
  const [chartData, setChartData] = useState<ChartData[]>([]);

  // Compute average lead time (closing date - created date) in days
  const avgLeadTime = React.useMemo(() => {
    const valid = deals.filter((d) => {
      const closing = d.closing_date;
      return closing && d.created_date;
    });
    if (valid.length === 0) return null;
    const total = valid.reduce((sum, d) => {
      const closingStr = d.closing_date!.split("T")[0];
      const createdStr = d.created_date!.split("T")[0];
      const diff =
        (new Date(closingStr).getTime() - new Date(createdStr).getTime()) /
        (1000 * 60 * 60 * 24);
      return sum + Math.max(0, diff);
    }, 0);
    return Math.round(total / valid.length);
  }, [deals]);

  // Compute average lead time for previous year deals
  const avgPrevLeadTime = React.useMemo(() => {
    const valid = prevDeals.filter((d) => {
      const closing = d.closing_date;
      return closing && d.created_date;
    });
    if (valid.length === 0) return null;
    const total = valid.reduce((sum, d) => {
      const closingStr = d.closing_date!.split("T")[0];
      const createdStr = d.created_date!.split("T")[0];
      const diff =
        (new Date(closingStr).getTime() - new Date(createdStr).getTime()) /
        (1000 * 60 * 60 * 24);
      return sum + Math.max(0, diff);
    }, 0);
    return Math.round(total / valid.length);
  }, [prevDeals]);

  // Use manual sync hook
  const { isSyncing, handleManualSync } = useManualSync();

  // Prepare chart data from deals
  const prepareChartData = useCallback(
    (deals: Deal[], selectedPeriod: number) => {
      // Group deals by date
      const groupedByDate = deals.reduce(
        (acc: Record<string, number>, item: Deal) => {
          const date = item.closing_date?.split("T")[0];
          if (!date) return acc; // Skip deals without closing date
          // Divide by 100 to get real values (database stores values multiplied by 100)
          const value = (item.value || 0) / 100;

          if (!acc[date]) {
            acc[date] = 0;
          }

          acc[date] += value;
          return acc;
        },
        {},
      );

      // Generate all dates in the period range
      const generateDateRange = (period: number) => {
        const dates: string[] = [];
        const { start: startDate, end: endDate } = janelaUltimosDias(period);

        // Generate all dates from start to end
        const currentDate = new Date(startDate);
        while (currentDate <= endDate) {
          dates.push(formatDateToLocal(currentDate));
          currentDate.setDate(currentDate.getDate() + 1);
        }

        return dates;
      };

      // Get all dates in the range
      const allDates = generateDateRange(selectedPeriod);

      // Create chart data with zero values for missing dates
      const chartData = allDates.map((date) => ({
        date,
        revenue: groupedByDate[date] || 0,
      }));

      setChartData(chartData);
    },
    [],
  );

  // Prepare chart data from deals using custom date range
  const prepareChartDataCustom = useCallback(
    (deals: Deal[], customDateRange: DateRange) => {
      // Group deals by date
      const groupedByDate = deals.reduce(
        (acc: Record<string, number>, item: Deal) => {
          const date = item.closing_date?.split("T")[0];
          if (!date) return acc; // Skip deals without closing date
          // Divide by 100 to get real values (database stores values multiplied by 100)
          const value = (item.value || 0) / 100;

          if (!acc[date]) {
            acc[date] = 0;
          }

          acc[date] += value;
          return acc;
        },
        {},
      );

      // Generate all dates in the custom range
      const generateCustomDateRange = (startDate: Date, endDate: Date) => {
        const dates: string[] = [];
        const currentDate = new Date(startDate);

        while (currentDate <= endDate) {
          dates.push(formatDateToLocal(currentDate));
          currentDate.setDate(currentDate.getDate() + 1);
        }

        return dates;
      };

      // Get all dates in the custom range
      const allDates = generateCustomDateRange(
        customDateRange.from!,
        customDateRange.to!,
      );

      console.log("Dashboard: Generated date range for chart:", {
        from: customDateRange.from,
        to: customDateRange.to,
        fromFormatted: customDateRange.from
          ? formatDateToLocal(customDateRange.from)
          : null,
        toFormatted: customDateRange.to
          ? formatDateToLocal(customDateRange.to)
          : null,
        generatedDates: allDates,
        dealsData: Object.keys(groupedByDate),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      // Create chart data with zero values for missing dates
      const chartData = allDates.map((date) => ({
        date,
        revenue: groupedByDate[date] || 0,
      }));

      setChartData(chartData);
    },
    [],
  );

  // Fetch deals data based on the selected period or custom date range using cached data
  const fetchDeals = useCallback(
    async (selectedPeriod?: number, customDateRange?: DateRange) => {
      setLoading(true);
      try {
        let url = "/api/deals-cache";

        if (customDateRange?.from && customDateRange?.to) {
          // Use custom date range - format as local date to avoid timezone issues
          const startDate = formatDateToLocal(customDateRange.from);
          const endDate = formatDateToLocal(customDateRange.to);
          console.log("Dashboard: Custom date range selected:", {
            originalFrom: customDateRange.from,
            originalTo: customDateRange.to,
            formattedStart: startDate,
            formattedEnd: endDate,
          });
          url = `/api/deals-cache?startDate=${startDate}&endDate=${endDate}`;
        } else if (selectedPeriod) {
          // Use period-based filtering
          url = `/api/deals-cache?period=${selectedPeriod}`;
        }

        // Force fresh data - bypass all caches (Service Worker, HTTP cache, etc.)
        // Add timestamp to URL to prevent cache hits
        const cacheBuster = `_t=${Date.now()}`;
        const urlWithCacheBuster = url.includes("?")
          ? `${url}&${cacheBuster}`
          : `${url}?${cacheBuster}`;

        const response = await fetch(urlWithCacheBuster, {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
            Expires: "0",
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.deals) {
          // Only count won deals for dashboard metrics
          const wonDeals = data.deals.filter((d: Deal) => {
            const s = d.status?.toLowerCase();
            return s === "won" || s === "1";
          });

          setDeals(wonDeals);

          // Calculate total value from won deals only
          const total = wonDeals.reduce((sum: number, item: Deal) => {
            // Divide by 100 to get real values (database stores values multiplied by 100)
            return sum + (item.value || 0) / 100;
          }, 0);

          setTotalValue(total);

          // Note: Total pairs sold is now fetched from dedicated API

          // Prepare chart data from won deals only
          if (customDateRange?.from && customDateRange?.to) {
            prepareChartDataCustom(wonDeals, customDateRange);
          } else if (selectedPeriod) {
            prepareChartData(wonDeals, selectedPeriod);
          }
        } else {
          setDeals([]);
          setTotalValue(0);
          setChartData([]);
        }
      } catch (error) {
        console.error("Error fetching deals:", error);
        setDeals([]);
        setTotalValue(0);
        setChartData([]);

        // Show user-friendly error message
        // You could add a toast notification here
      } finally {
        setLoading(false);
      }
    },
    [prepareChartData, prepareChartDataCustom],
  );

  // Note: Total pairs sold is now fetched from dedicated API instead of calculated

  // Handle period change using global hook
  const handlePeriodChangeLocal = (newPeriod: number) => {
    handlePeriodChange(newPeriod);
  };

  // Handle custom date range change using global hook
  const handleDateRangeChangeLocal = (newDateRange: DateRange | undefined) => {
    handleDateRangeChange(newDateRange);
  };

  // Fetch total pairs sold from dedicated API
  const fetchTotalPairsSold = useCallback(
    async (selectedPeriod?: number, customDateRange?: DateRange) => {
      try {
        let url = "/api/pairs-sold-total";

        if (customDateRange?.from && customDateRange?.to) {
          // Use custom date range
          const startDate = formatDateToLocal(customDateRange.from);
          const endDate = formatDateToLocal(customDateRange.to);
          url = `/api/pairs-sold-total?startDate=${startDate}&endDate=${endDate}`;
        } else if (selectedPeriod) {
          // Use period-based filtering
          url = `/api/pairs-sold-total?period=${selectedPeriod}`;
        }

        // Force fresh data - bypass all caches
        const cacheBuster = `_t=${Date.now()}`;
        const urlWithCacheBuster = url.includes("?")
          ? `${url}&${cacheBuster}`
          : `${url}?${cacheBuster}`;

        const response = await fetch(urlWithCacheBuster, {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
            Expires: "0",
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.totalPairsSold !== undefined) {
          setTotalPairsSold(data.totalPairsSold);
        } else {
          setTotalPairsSold(0);
        }
      } catch (error) {
        console.error("Error fetching total pairs sold:", error);
        setTotalPairsSold(0);
      }
    },
    [],
  );

  // Fetch previous year deals
  const fetchPreviousYearDeals = useCallback(
    async (selectedPeriod?: number, customDateRange?: DateRange) => {
      try {
        let url = "/api/deals-cache";
        if (customDateRange?.from && customDateRange?.to) {
          const startDate = formatDateToLocal(
            shiftDateOneYearBack(customDateRange.from),
          );
          const endDate = formatDateToLocal(
            shiftDateOneYearBack(customDateRange.to),
          );
          url = `/api/deals-cache?startDate=${startDate}&endDate=${endDate}`;
        } else if (selectedPeriod) {
          // Calculate the same period but for one year ago
          const janela = janelaUltimosDias(selectedPeriod);
          const prevYearStart = shiftDateOneYearBack(janela.start);
          const prevYearEnd = shiftDateOneYearBack(janela.end);
          url = `/api/deals-cache?startDate=${formatDateToLocal(prevYearStart)}&endDate=${formatDateToLocal(prevYearEnd)}`;
        }

        const response = await fetch(`${url}&_t=${Date.now()}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
        if (!response.ok) return;

        const data = await response.json();
        if (data.deals) {
          // Only count won deals for previous year comparison
          const prevWonDeals = data.deals.filter((d: Deal) => {
            const s = d.status?.toLowerCase();
            return s === "won" || s === "1";
          });

          setPrevDeals(prevWonDeals);
          const total = prevWonDeals.reduce(
            (sum: number, item: Deal) => sum + (item.value || 0) / 100,
            0,
          );
          setPrevTotalValue(total);

          // Build previous year chart data aligned by period length (won deals only)
          const groupedByDate = prevWonDeals.reduce(
            (acc: Record<string, number>, item: Deal) => {
              const date = item.closing_date?.split("T")[0];
              if (!date) return acc;
              const value = (item.value || 0) / 100;
              acc[date] = (acc[date] || 0) + value;
              return acc;
            },
            {},
          );

          // Generate all dates in the previous year period
          const generateDates = (start: Date, end: Date) => {
            const dates: string[] = [];
            const cur = new Date(start);
            while (cur <= end) {
              dates.push(formatDateToLocal(cur));
              cur.setDate(cur.getDate() + 1);
            }
            return dates;
          };

          let dates: string[] = [];
          if (customDateRange?.from && customDateRange?.to) {
            dates = generateDates(
              shiftDateOneYearBack(customDateRange.from),
              shiftDateOneYearBack(customDateRange.to),
            );
          } else if (selectedPeriod) {
            const janela = janelaUltimosDias(selectedPeriod);
            dates = generateDates(
              shiftDateOneYearBack(janela.start),
              shiftDateOneYearBack(janela.end),
            );
          }

          setPrevChartData(
            dates.map((date) => ({ date, revenue: groupedByDate[date] || 0 })),
          );
        } else {
          setPrevDeals([]);
          setPrevTotalValue(0);
          setPrevChartData([]);
        }
      } catch (error) {
        console.error("Error fetching previous year deals:", error);
        setPrevDeals([]);
        setPrevTotalValue(0);
        setPrevChartData([]);
      }
    },
    [],
  );

  // Fetch previous year pairs sold
  const fetchPreviousYearPairsSold = useCallback(
    async (selectedPeriod?: number, customDateRange?: DateRange) => {
      try {
        let url = "/api/pairs-sold-total";
        if (customDateRange?.from && customDateRange?.to) {
          const startDate = formatDateToLocal(
            shiftDateOneYearBack(customDateRange.from),
          );
          const endDate = formatDateToLocal(
            shiftDateOneYearBack(customDateRange.to),
          );
          url = `/api/pairs-sold-total?startDate=${startDate}&endDate=${endDate}`;
        } else if (selectedPeriod) {
          const janela = janelaUltimosDias(selectedPeriod);
          const prevYearStart = shiftDateOneYearBack(janela.start);
          const prevYearEnd = shiftDateOneYearBack(janela.end);
          url = `/api/pairs-sold-total?startDate=${formatDateToLocal(prevYearStart)}&endDate=${formatDateToLocal(prevYearEnd)}`;
        }

        const response = await fetch(`${url}&_t=${Date.now()}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
        if (!response.ok) return;

        const data = await response.json();
        setPrevTotalPairsSold(data.totalPairsSold ?? 0);
      } catch (error) {
        console.error("Error fetching previous year pairs sold:", error);
        setPrevTotalPairsSold(0);
      }
    },
    [],
  );

  // Initial data fetch using global date state
  useEffect(() => {
    const initializeData = async () => {
      // Only fetch data after hydration is complete
      if (!isHydrated) {
        console.log("⏳ Dashboard: Waiting for hydration...");
        return;
      }

      console.log("✅ Dashboard: Hydrated, fetching data...", {
        useCustomPeriod,
        period,
        dateRange,
      });

      if (!useCustomPeriod) {
        await Promise.all([
          fetchDeals(period),
          fetchTotalPairsSold(period),
          fetchPreviousYearDeals(period),
          fetchPreviousYearPairsSold(period),
        ]);
      } else {
        await Promise.all([
          fetchDeals(period, dateRange),
          fetchTotalPairsSold(period, dateRange),
          fetchPreviousYearDeals(period, dateRange),
          fetchPreviousYearPairsSold(period, dateRange),
        ]);
      }
    };

    initializeData();
  }, [
    period,
    useCustomPeriod,
    dateRange,
    fetchDeals,
    fetchTotalPairsSold,
    fetchPreviousYearDeals,
    fetchPreviousYearPairsSold,
    isHydrated,
  ]);

  // Function to refresh all dashboard data
  const refreshDashboardData = useCallback(() => {
    console.log("🔄 Dashboard: Refreshing data after sync...");
    if (useCustomPeriod && dateRange?.from && dateRange?.to) {
      fetchDeals(undefined, dateRange);
      fetchTotalPairsSold(undefined, dateRange);
      fetchPreviousYearDeals(undefined, dateRange);
      fetchPreviousYearPairsSold(undefined, dateRange);
    } else {
      fetchDeals(period);
      fetchTotalPairsSold(period);
      fetchPreviousYearDeals(period);
      fetchPreviousYearPairsSold(period);
    }
  }, [
    useCustomPeriod,
    dateRange,
    period,
    fetchDeals,
    fetchTotalPairsSold,
    fetchPreviousYearDeals,
    fetchPreviousYearPairsSold,
  ]);

  // Register this page for automatic refresh after sync
  useDataRefresh("dashboard", refreshDashboardData);

  return (
    <div className="hud-page">
      <CabecalhoDaPagina
        icone={LayoutDashboard}
        titulo="Dashboard"
        descricao="Pares, faturamento e ticket médio do período, comparados ao ano anterior"
        acoes={
          <GrupoDeAcoes rotulo="Ações do dashboard">
            <button type="button" onClick={handleManualSync} disabled={isSyncing}>
              <RefreshCw className={isSyncing ? "animate-spin" : undefined} />
              {isSyncing ? "Sincronizando..." : "Sincronizar dados"}
            </button>
          </GrupoDeAcoes>
        }
      />

      <BarraDeFiltros>
        <Campo rotulo="Período">
          <GrupoDeAcoes rotulo="Período" separar={false}>
            {([30, 60, 90] as const).map((dias) => (
              <button
                key={dias}
                type="button"
                aria-pressed={!useCustomPeriod && period === dias}
                onClick={() => handlePeriodChangeLocal(dias)}
              >
                Últimos {dias} dias
              </button>
            ))}
          </GrupoDeAcoes>
        </Campo>
        <Campo rotulo="Datas">
          <div className="hud-date-field">
            <Calendar23 value={dateRange} onChange={handleDateRangeChangeLocal} hideLabel />
          </div>
        </Campo>
      </BarraDeFiltros>

      <dl className="hud-kpi-strip" aria-label="Indicadores do Dashboard">
        {[
          {
            label: "Total de Pares Vendidos",
            value: totalPairsSold.toLocaleString("pt-BR"),
            previous: prevTotalPairsSold.toLocaleString("pt-BR"),
            icon: Package,
          },
          {
            label: "Faturamento Total",
            value: formatCurrency(totalValue, "BRL"),
            previous: formatCurrency(prevTotalValue, "BRL"),
            icon: Wallet,
          },
          {
            label: "Lead Time",
            value: avgLeadTime !== null ? `${avgLeadTime} dias` : "—",
            previous: avgPrevLeadTime !== null ? `${avgPrevLeadTime} dias` : "—",
            detail: "Tempo médio de fechamento",
            icon: Clock3,
          },
        ].map(({ label, value, previous, detail, icon: Icon }) => (
          <div className="hud-kpi" key={label}>
            <span className="hud-kpi-icon" aria-hidden="true"><Icon /></span>
            <div className="min-w-0">
              <dt>{label}</dt>
              {loading ? (
                <dd><Skeleton className="my-1 h-7 w-24 max-w-full" /></dd>
              ) : (
                <>
                  <dd className="hud-kpi-value">{value}</dd>
                  <dd className="hud-kpi-detail">Anterior: {previous}</dd>
                </>
              )}
              {detail && <dd className="hud-kpi-detail">{detail}</dd>}
            </div>
          </div>
        ))}
      </dl>

      {/* Revenue Charts - area + bar + ciclo de vendas */}
      <div className="hud-revenue-grid">
        {loading ? (
          <Skeleton className="hud-chart-height w-full" />
        ) : (
          <ChartAreaGradient
            title="Faturamento por Período"
            description={
              useCustomPeriod && dateRange?.from && dateRange?.to
                ? `Faturamento de ${dateRange.from.toLocaleDateString(
                    "pt-BR",
                  )} até ${dateRange.to.toLocaleDateString("pt-BR")}`
                : `Faturamento nos últimos ${period} dias`
            }
            data={chartData}
            period={period}
            prevYearData={prevChartData}
          />
        )}

        {loading ? (
          <Skeleton className="hud-chart-height w-full" />
        ) : (
          <ChartBarFaturamento
            deals={deals}
            prevDeals={prevDeals}
            dateRange={dateRange}
            period={period}
            useCustomPeriod={useCustomPeriod}
          />
        )}

        {loading ? (
          <Skeleton className="hud-chart-height w-full" />
        ) : (
          <ChartBarCicloVendas deals={deals} prevDeals={prevDeals} />
        )}
      </div>

      {/* Gráficos de Pizza - 4 em uma linha com tabs para ano atual/anterior */}
      <div className="hud-breakdown-grid">
        {/* Vendas por Estado */}
        <div>
          {loading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <ChartPieEstados
              deals={deals}
              prevDeals={prevDeals}
              title="Vendas por Estado"
              description="Distribuição do faturamento por estado"
              showTabs={true}
            />
          )}
        </div>

        {/* Segmento de Negócio */}
        <div>
          {loading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <ChartPieGeneric
              deals={deals}
              prevDeals={prevDeals}
              fieldKey="segmento_de_negocio"
              title="Segmento de Negócio"
              description="Distribuição do faturamento por segmento"
              countLabel="segmentos"
              showTabs={true}
            />
          )}
        </div>

        {/* Intenção de Compra */}
        <div>
          {loading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <ChartPieGeneric
              deals={deals}
              prevDeals={prevDeals}
              fieldKey="intencao_de_compra"
              title="Intenção de Compra"
              description="Distribuição do faturamento por intenção"
              countLabel="intenções"
              showTabs={true}
            />
          )}
        </div>

        {/* Origem de Vendas */}
        <div>
          {loading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <ChartPieGeneric
              deals={deals}
              prevDeals={prevDeals}
              keyExtractor={(deal) => {
                const medium =
                  typeof deal["utm-medium"] === "string"
                    ? deal["utm-medium"].trim()
                    : "";
                const source =
                  typeof deal["utm-source"] === "string"
                    ? deal["utm-source"].trim()
                    : "";
                if (medium && source) return `${medium} / ${source}`;
                if (medium) return medium;
                if (source) return source;
                return "Não informado";
              }}
              title="Origem de Vendas"
              description="Combinação de UTM Medium e UTM Source"
              countLabel="origens"
              showTabs={true}
            />
          )}
        </div>
      </div>

      {/* Sync Checker - monitora sincronizações */}
      <SyncChecker />
    </div>
  );
}
