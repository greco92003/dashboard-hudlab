"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { ChartAreaGradient } from "@/components/ui/chart-area-gradient";
import Calendar23 from "@/components/calendar-23";
import { DateRange } from "react-day-picker";
import { Label } from "@/components/ui/label";
import { useGlobalDateRange } from "@/hooks/useGlobalDateRange";
import { RefreshCw } from "lucide-react";
import { ChartPieEstados } from "@/components/ui/chart-pie-estados";
import { useManualSync } from "@/hooks/useManualSync";
import { SyncChecker } from "@/components/ui/sync-checker";
import { useDataRefresh } from "@/hooks/useDataRefresh";

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

  // Chart data
  const [chartData, setChartData] = useState<ChartData[]>([]);

  // Use manual sync hook
  const { isSyncing, handleManualSync } = useManualSync();

  // Prepare chart data from deals
  const prepareChartData = useCallback(
    (deals: Deal[], selectedPeriod: number) => {
      // Group deals by date
      const groupedByDate = deals.reduce(
        (acc: Record<string, number>, item: Deal) => {
          const date =
            item.custom_field_value?.split("T")[0] ||
            item.closing_date?.split("T")[0];
          if (!date) return acc; // Skip deals without closing date
          // Divide by 100 to get real values (database stores values multiplied by 100)
          const value = (item.value || 0) / 100;

          if (!acc[date]) {
            acc[date] = 0;
          }

          acc[date] += value;
          return acc;
        },
        {}
      );

      // Generate all dates in the period range
      const generateDateRange = (period: number) => {
        const dates: string[] = [];
        const now = new Date();
        const endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);

        const startDate = new Date(now);
        // Calculate months to subtract based on period
        let monthsToSubtract = 1; // default for 30 days
        if (period === 60) {
          monthsToSubtract = 2;
        } else if (period === 90) {
          monthsToSubtract = 3;
        }

        startDate.setMonth(startDate.getMonth() - monthsToSubtract);
        startDate.setHours(0, 0, 0, 0);

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
    []
  );

  // Prepare chart data from deals using custom date range
  const prepareChartDataCustom = useCallback(
    (deals: Deal[], customDateRange: DateRange) => {
      // Group deals by date
      const groupedByDate = deals.reduce(
        (acc: Record<string, number>, item: Deal) => {
          const date =
            item.custom_field_value?.split("T")[0] ||
            item.closing_date?.split("T")[0];
          if (!date) return acc; // Skip deals without closing date
          // Divide by 100 to get real values (database stores values multiplied by 100)
          const value = (item.value || 0) / 100;

          if (!acc[date]) {
            acc[date] = 0;
          }

          acc[date] += value;
          return acc;
        },
        {}
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
        customDateRange.to!
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
    []
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
          setDeals(data.deals);

          // Calculate total value
          const total = data.deals.reduce((sum: number, item: Deal) => {
            // Divide by 100 to get real values (database stores values multiplied by 100)
            return sum + (item.value || 0) / 100;
          }, 0);

          setTotalValue(total);

          // Note: Total pairs sold is now fetched from dedicated API

          // Prepare chart data
          if (customDateRange?.from && customDateRange?.to) {
            prepareChartDataCustom(data.deals, customDateRange);
          } else if (selectedPeriod) {
            prepareChartData(data.deals, selectedPeriod);
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
    [prepareChartData, prepareChartDataCustom]
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
    []
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
        await fetchDeals(period);
        await fetchTotalPairsSold(period);
      } else {
        await fetchDeals(period, dateRange);
        await fetchTotalPairsSold(period, dateRange);
      }
    };

    initializeData();
  }, [
    period,
    useCustomPeriod,
    dateRange,
    fetchDeals,
    fetchTotalPairsSold,
    isHydrated,
  ]);

  // Function to refresh all dashboard data
  const refreshDashboardData = useCallback(() => {
    console.log("🔄 Dashboard: Refreshing data after sync...");
    if (useCustomPeriod && dateRange?.from && dateRange?.to) {
      fetchDeals(undefined, dateRange);
      fetchTotalPairsSold(undefined, dateRange);
    } else {
      fetchDeals(period);
      fetchTotalPairsSold(period);
    }
  }, [useCustomPeriod, dateRange, period, fetchDeals, fetchTotalPairsSold]);

  // Register this page for automatic refresh after sync
  useDataRefresh("dashboard", refreshDashboardData);

  return (
    <div className="flex flex-1 flex-col gap-1">
      <h1 className="text-xl sm:text-2xl font-bold">Dashboard</h1>

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

        {/* Botão de sync manual */}
        <div className="flex">
          <Button
            onClick={handleManualSync}
            disabled={isSyncing}
            variant="outline"
            className="flex items-center gap-2 text-xs sm:text-sm w-full sm:w-auto"
          >
            {isSyncing ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">
              {isSyncing ? "Sincronizando..." : "Sincronizar Dados"}
            </span>
            <span className="sm:hidden">{isSyncing ? "Sync..." : "Sync"}</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 mb-4">
        {/* Primeira linha: Total de Pares e Faturamento Total */}
        <Card>
          <CardHeader className="py-2 sm:py-3">
            <CardTitle className="text-sm sm:text-base">
              Total de Pares Vendidos
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            {loading ? (
              <Skeleton className="h-6 sm:h-8 w-[150px] sm:w-[200px]" />
            ) : (
              <p className="text-xl sm:text-2xl font-bold">{totalPairsSold}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-2 sm:py-3">
            <CardTitle className="text-sm sm:text-base">
              Faturamento Total
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            {loading ? (
              <Skeleton className="h-6 sm:h-8 w-[150px] sm:w-[200px]" />
            ) : (
              <p className="text-xl sm:text-2xl font-bold">
                {formatCurrency(totalValue, "BRL")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Revenue Chart */}
      <div className="w-full mb-4">
        {loading ? (
          <Skeleton className="h-[400px] w-full" />
        ) : (
          <ChartAreaGradient
            title="Faturamento por Período"
            description={
              useCustomPeriod && dateRange?.from && dateRange?.to
                ? `Faturamento de ${dateRange.from.toLocaleDateString(
                    "pt-BR"
                  )} até ${dateRange.to.toLocaleDateString("pt-BR")}`
                : `Faturamento nos últimos ${period} dias`
            }
            data={chartData}
            period={period}
          />
        )}
      </div>

      {/* Estados Chart */}
      <div className="w-full mb-4">
        {loading ? (
          <Skeleton className="h-[300px] sm:h-[400px] w-full" />
        ) : (
          <ChartPieEstados deals={deals} />
        )}
      </div>

      {/* Sync Checker - monitora sincronizações */}
      <SyncChecker />
    </div>
  );
}
