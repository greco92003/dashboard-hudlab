"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { ChartAreaGradient } from "@/components/ui/chart-area-gradient";
import { ChartBarFaturamento } from "@/components/ui/chart-bar-faturamento";
import { ChartBarCicloVendas } from "@/components/ui/chart-bar-ciclo-vendas";
import Calendar23 from "@/components/calendar-23";
import { DateRange } from "react-day-picker";
import { Label } from "@/components/ui/label";
import { useGlobalDateRange } from "@/hooks/useGlobalDateRange";
import { RefreshCw } from "lucide-react";
import { ChartPieEstados } from "@/components/ui/chart-pie-estados";
import { ChartPieGeneric } from "@/components/ui/chart-pie-generic";
import { SidebarTrigger } from "@/components/ui/sidebar";

// Same flat deal shape served by /api/deals-cache, here mapped from GHL
interface Deal {
  deal_id: string;
  title: string;
  value: number;
  currency: string;
  status: string | null;
  stage_id: string | null;
  closing_date: string | null;
  created_date: string | null;
  custom_field_value: string | null;
  custom_field_id: string | null;
  estado: string | null;
  "quantidade-de-pares": string | null;
  vendedor: string | null;
  designer: string | null;
  contact_id: string | null;
  organization_id: string | null;
  api_updated_at: string | null;
  segmento_de_negocio: string | null;
  intencao_de_compra: string | null;
  "utm-source": string | null;
  "utm-medium": string | null;
  [key: string]: string | number | null | undefined;
}

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

export default function DashboardGhlPage() {
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Use global date range hook (shared with /dashboard for side-by-side comparison)
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
      const closing = d.custom_field_value || d.closing_date;
      return closing && d.created_date;
    });
    if (valid.length === 0) return null;
    const total = valid.reduce((sum, d) => {
      const closingStr = (d.custom_field_value || d.closing_date)!.split(
        "T",
      )[0];
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
      const closing = d.custom_field_value || d.closing_date;
      return closing && d.created_date;
    });
    if (valid.length === 0) return null;
    const total = valid.reduce((sum, d) => {
      const closingStr = (d.custom_field_value || d.closing_date)!.split(
        "T",
      )[0];
      const createdStr = d.created_date!.split("T")[0];
      const diff =
        (new Date(closingStr).getTime() - new Date(createdStr).getTime()) /
        (1000 * 60 * 60 * 24);
      return sum + Math.max(0, diff);
    }, 0);
    return Math.round(total / valid.length);
  }, [prevDeals]);

  // Prepare chart data from deals
  const prepareChartData = useCallback(
    (deals: Deal[], selectedPeriod: number) => {
      const groupedByDate = deals.reduce(
        (acc: Record<string, number>, item: Deal) => {
          const date =
            item.custom_field_value?.split("T")[0] ||
            item.closing_date?.split("T")[0];
          if (!date) return acc;
          // Divide by 100 to get real values (API serves values multiplied by 100)
          const value = (item.value || 0) / 100;

          if (!acc[date]) {
            acc[date] = 0;
          }

          acc[date] += value;
          return acc;
        },
        {},
      );

      const generateDateRange = (period: number) => {
        const dates: string[] = [];
        const now = new Date();
        const endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);

        const startDate = new Date(now);
        let monthsToSubtract = 1;
        if (period === 60) {
          monthsToSubtract = 2;
        } else if (period === 90) {
          monthsToSubtract = 3;
        }

        startDate.setMonth(startDate.getMonth() - monthsToSubtract);
        startDate.setHours(0, 0, 0, 0);

        const currentDate = new Date(startDate);
        while (currentDate <= endDate) {
          dates.push(formatDateToLocal(currentDate));
          currentDate.setDate(currentDate.getDate() + 1);
        }

        return dates;
      };

      const allDates = generateDateRange(selectedPeriod);

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
      const groupedByDate = deals.reduce(
        (acc: Record<string, number>, item: Deal) => {
          const date =
            item.custom_field_value?.split("T")[0] ||
            item.closing_date?.split("T")[0];
          if (!date) return acc;
          const value = (item.value || 0) / 100;

          if (!acc[date]) {
            acc[date] = 0;
          }

          acc[date] += value;
          return acc;
        },
        {},
      );

      const generateCustomDateRange = (startDate: Date, endDate: Date) => {
        const dates: string[] = [];
        const currentDate = new Date(startDate);

        while (currentDate <= endDate) {
          dates.push(formatDateToLocal(currentDate));
          currentDate.setDate(currentDate.getDate() + 1);
        }

        return dates;
      };

      const allDates = generateCustomDateRange(
        customDateRange.from!,
        customDateRange.to!,
      );

      const chartData = allDates.map((date) => ({
        date,
        revenue: groupedByDate[date] || 0,
      }));

      setChartData(chartData);
    },
    [],
  );

  // Fetch deals data from the GHL API route
  const fetchDeals = useCallback(
    async (
      selectedPeriod?: number,
      customDateRange?: DateRange,
      forceRefresh = false,
    ) => {
      setLoading(true);
      try {
        let url = "/api/ghl/deals";

        if (customDateRange?.from && customDateRange?.to) {
          const startDate = formatDateToLocal(customDateRange.from);
          const endDate = formatDateToLocal(customDateRange.to);
          url = `/api/ghl/deals?startDate=${startDate}&endDate=${endDate}`;
        } else if (selectedPeriod) {
          url = `/api/ghl/deals?period=${selectedPeriod}`;
        }

        const params = `_t=${Date.now()}${forceRefresh ? "&refresh=1" : ""}`;
        const urlWithParams = url.includes("?")
          ? `${url}&${params}`
          : `${url}?${params}`;

        const response = await fetch(urlWithParams, {
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

          const total = wonDeals.reduce((sum: number, item: Deal) => {
            return sum + (item.value || 0) / 100;
          }, 0);

          setTotalValue(total);

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
        console.error("Error fetching GHL deals:", error);
        setDeals([]);
        setTotalValue(0);
        setChartData([]);
      } finally {
        setLoading(false);
      }
    },
    [prepareChartData, prepareChartDataCustom],
  );

  // Handle period change using global hook
  const handlePeriodChangeLocal = (newPeriod: number) => {
    handlePeriodChange(newPeriod);
  };

  // Handle custom date range change using global hook
  const handleDateRangeChangeLocal = (newDateRange: DateRange | undefined) => {
    handleDateRangeChange(newDateRange);
  };

  // Fetch total pairs sold from the GHL API route
  const fetchTotalPairsSold = useCallback(
    async (
      selectedPeriod?: number,
      customDateRange?: DateRange,
      forceRefresh = false,
    ) => {
      try {
        let url = "/api/ghl/pairs-sold-total";

        if (customDateRange?.from && customDateRange?.to) {
          const startDate = formatDateToLocal(customDateRange.from);
          const endDate = formatDateToLocal(customDateRange.to);
          url = `/api/ghl/pairs-sold-total?startDate=${startDate}&endDate=${endDate}`;
        } else if (selectedPeriod) {
          url = `/api/ghl/pairs-sold-total?period=${selectedPeriod}`;
        }

        const params = `_t=${Date.now()}${forceRefresh ? "&refresh=1" : ""}`;
        const urlWithParams = url.includes("?")
          ? `${url}&${params}`
          : `${url}?${params}`;

        const response = await fetch(urlWithParams, {
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
        console.error("Error fetching GHL total pairs sold:", error);
        setTotalPairsSold(0);
      }
    },
    [],
  );

  // Fetch previous year deals
  const fetchPreviousYearDeals = useCallback(
    async (selectedPeriod?: number, customDateRange?: DateRange) => {
      try {
        let url = "/api/ghl/deals";
        if (customDateRange?.from && customDateRange?.to) {
          const startDate = formatDateToLocal(
            shiftDateOneYearBack(customDateRange.from),
          );
          const endDate = formatDateToLocal(
            shiftDateOneYearBack(customDateRange.to),
          );
          url = `/api/ghl/deals?startDate=${startDate}&endDate=${endDate}`;
        } else if (selectedPeriod) {
          const now = new Date();
          const prevYearEnd = shiftDateOneYearBack(now);
          let monthsToSubtract = 1;
          if (selectedPeriod === 60) monthsToSubtract = 2;
          else if (selectedPeriod === 90) monthsToSubtract = 3;
          const prevYearStart = new Date(prevYearEnd);
          prevYearStart.setMonth(prevYearStart.getMonth() - monthsToSubtract);
          url = `/api/ghl/deals?startDate=${formatDateToLocal(prevYearStart)}&endDate=${formatDateToLocal(prevYearEnd)}`;
        }

        const response = await fetch(`${url}&_t=${Date.now()}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
        if (!response.ok) return;

        const data = await response.json();
        if (data.deals) {
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

          const groupedByDate = prevWonDeals.reduce(
            (acc: Record<string, number>, item: Deal) => {
              const date =
                item.custom_field_value?.split("T")[0] ||
                item.closing_date?.split("T")[0];
              if (!date) return acc;
              const value = (item.value || 0) / 100;
              acc[date] = (acc[date] || 0) + value;
              return acc;
            },
            {},
          );

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
            const now = new Date();
            const prevYearEnd = shiftDateOneYearBack(now);
            let monthsToSubtract = 1;
            if (selectedPeriod === 60) monthsToSubtract = 2;
            else if (selectedPeriod === 90) monthsToSubtract = 3;
            const prevYearStart = new Date(prevYearEnd);
            prevYearStart.setMonth(prevYearStart.getMonth() - monthsToSubtract);
            dates = generateDates(prevYearStart, prevYearEnd);
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
        console.error("Error fetching GHL previous year deals:", error);
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
        let url = "/api/ghl/pairs-sold-total";
        if (customDateRange?.from && customDateRange?.to) {
          const startDate = formatDateToLocal(
            shiftDateOneYearBack(customDateRange.from),
          );
          const endDate = formatDateToLocal(
            shiftDateOneYearBack(customDateRange.to),
          );
          url = `/api/ghl/pairs-sold-total?startDate=${startDate}&endDate=${endDate}`;
        } else if (selectedPeriod) {
          const now = new Date();
          const prevYearEnd = shiftDateOneYearBack(now);
          let monthsToSubtract = 1;
          if (selectedPeriod === 60) monthsToSubtract = 2;
          else if (selectedPeriod === 90) monthsToSubtract = 3;
          const prevYearStart = new Date(prevYearEnd);
          prevYearStart.setMonth(prevYearStart.getMonth() - monthsToSubtract);
          url = `/api/ghl/pairs-sold-total?startDate=${formatDateToLocal(prevYearStart)}&endDate=${formatDateToLocal(prevYearEnd)}`;
        }

        const response = await fetch(`${url}&_t=${Date.now()}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
        if (!response.ok) return;

        const data = await response.json();
        setPrevTotalPairsSold(data.totalPairsSold ?? 0);
      } catch (error) {
        console.error("Error fetching GHL previous year pairs sold:", error);
        setPrevTotalPairsSold(0);
      }
    },
    [],
  );

  // Initial data fetch using global date state
  useEffect(() => {
    const initializeData = async () => {
      if (!isHydrated) {
        return;
      }

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

  // Force a fresh fetch from the GHL API (bypasses the server-side cache)
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      if (useCustomPeriod && dateRange?.from && dateRange?.to) {
        await Promise.all([
          fetchDeals(undefined, dateRange, true),
          fetchTotalPairsSold(undefined, dateRange, true),
          fetchPreviousYearDeals(undefined, dateRange),
          fetchPreviousYearPairsSold(undefined, dateRange),
        ]);
      } else {
        await Promise.all([
          fetchDeals(period, undefined, true),
          fetchTotalPairsSold(period, undefined, true),
          fetchPreviousYearDeals(period),
          fetchPreviousYearPairsSold(period),
        ]);
      }
    } finally {
      setIsRefreshing(false);
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

  return (
    <div className="flex flex-1 flex-col gap-1">
      <div className="flex items-center gap-2">
        <SidebarTrigger />
        <h1 className="text-xl sm:text-2xl font-bold">Dashboard GHL</h1>
        <Badge variant="outline" className="text-xs">
          GoHighLevel · provisório
        </Badge>
      </div>

      <div className="flex flex-col lg:flex-row gap-2 lg:gap-4 mb-4 mt-2 lg:items-center">
        {/* 3 botões de período */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <Button
            variant={!useCustomPeriod && period === 30 ? "default" : "outline"}
            onClick={() => handlePeriodChangeLocal(30)}
            className="text-xs sm:text-sm"
          >
            Último mês
          </Button>
          <Button
            variant={!useCustomPeriod && period === 60 ? "default" : "outline"}
            onClick={() => handlePeriodChangeLocal(60)}
            className="text-xs sm:text-sm"
          >
            Últimos 2 meses
          </Button>
          <Button
            variant={!useCustomPeriod && period === 90 ? "default" : "outline"}
            onClick={() => handlePeriodChangeLocal(90)}
            className="text-xs sm:text-sm"
          >
            Últimos 3 meses
          </Button>
        </div>

        {/* Seletor de período personalizado */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <Label className="text-sm sm:text-base whitespace-nowrap lg:hidden">
            Período personalizado:
          </Label>
          <div className="w-full sm:min-w-[250px] lg:w-auto">
            <Calendar23
              value={dateRange}
              onChange={handleDateRangeChangeLocal}
              hideLabel
            />
          </div>
        </div>

        {/* Botão de refresh direto na API do GHL */}
        <div className="flex">
          <Button
            onClick={handleRefresh}
            disabled={isRefreshing || loading}
            variant="outline"
            className="flex items-center gap-2 text-xs sm:text-sm w-full sm:w-auto"
          >
            {isRefreshing ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">
              {isRefreshing ? "Atualizando..." : "Atualizar do GHL"}
            </span>
            <span className="sm:hidden">
              {isRefreshing ? "Sync..." : "Atualizar"}
            </span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4">
        {/* Primeira linha: Total de Pares, Faturamento Total e Lead Time */}
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-shrink-0">
                <CardTitle className="text-sm sm:text-base whitespace-nowrap">
                  Total de Pares Vendidos
                </CardTitle>
              </div>
              {loading ? (
                <Skeleton className="h-6 sm:h-8 w-[150px]" />
              ) : (
                <div className="text-right">
                  <p className="text-xl sm:text-2xl font-bold whitespace-nowrap">
                    {totalPairsSold}
                  </p>
                  <p className="text-xs text-muted-foreground whitespace-nowrap">
                    Anterior: {prevTotalPairsSold}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-shrink-0">
                <CardTitle className="text-sm sm:text-base whitespace-nowrap">
                  Faturamento Total
                </CardTitle>
              </div>
              {loading ? (
                <Skeleton className="h-6 sm:h-8 w-[150px]" />
              ) : (
                <div className="text-right">
                  <p className="text-xl sm:text-2xl font-bold whitespace-nowrap">
                    {formatCurrency(totalValue, "BRL")}
                  </p>
                  <p className="text-xs text-muted-foreground whitespace-nowrap">
                    Anterior: {formatCurrency(prevTotalValue, "BRL")}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Lead Time */}
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-shrink-0">
                <CardTitle className="text-sm sm:text-base whitespace-nowrap">
                  Lead Time
                </CardTitle>
                <p className="text-xs text-muted-foreground whitespace-nowrap mt-0.5">
                  Tempo médio de fechamento
                </p>
              </div>
              {loading ? (
                <Skeleton className="h-6 sm:h-8 w-[120px]" />
              ) : (
                <div className="text-right">
                  <p className="text-xl sm:text-2xl font-bold whitespace-nowrap">
                    {avgLeadTime !== null ? `${avgLeadTime} dias` : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground whitespace-nowrap">
                    Anterior:{" "}
                    {avgPrevLeadTime !== null ? `${avgPrevLeadTime} dias` : "—"}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Charts - area + bar + ciclo de vendas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 mb-4">
        {loading ? (
          <Skeleton className="h-[400px] w-full" />
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
          <Skeleton className="h-[400px] w-full" />
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
          <Skeleton className="h-[400px] w-full" />
        ) : (
          <ChartBarCicloVendas deals={deals} prevDeals={prevDeals} />
        )}
      </div>

      {/* Gráficos de Pizza - 4 em uma linha com tabs para ano atual/anterior */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
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
    </div>
  );
}
