"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import Calendar23 from "@/components/calendar-23";
import { DateRange } from "react-day-picker";
import { useGlobalDateRange } from "@/hooks/useGlobalDateRange";
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

export default function PairsSoldPage() {
  const [, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalValue, setTotalValue] = useState(0);
  const [totalPairsSold, setTotalPairsSold] = useState(0);
  const [pairsSoldPerDay, setPairsSoldPerDay] = useState(0);

  // Use global date range hook
  const {
    dateRange,
    period,
    useCustomPeriod,
    isHydrated,
    handleDateRangeChange,
    handlePeriodChange,
    getApiUrl,
  } = useGlobalDateRange();

  // Helper function to format date as local YYYY-MM-DD without timezone conversion
  const formatDateToLocal = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Helper function to parse ISO date string as local date without timezone conversion
  const parseLocalDateFromISO = (isoString: string): Date => {
    // Extract date part from ISO string (YYYY-MM-DD)
    const datePart = isoString.split("T")[0];
    const [year, month, day] = datePart.split("-").map(Number);
    return new Date(year, month - 1, day); // month is 0-indexed
  };

  // Define columns for the data table (currently unused but kept for future use)
  // const columns: ColumnDef<Deal>[] = [
  //   {
  //     accessorKey: "deal.title",
  //     header: ({ column }) => {
  //       return (
  //         <Button
  //           variant="ghost"
  //           onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
  //           className="px-0"
  //         >
  //           Título
  //           {column.getIsSorted() === "asc" ? (
  //             <ArrowUp className="ml-2 h-4 w-4" />
  //           ) : column.getIsSorted() === "desc" ? (
  //             <ArrowDown className="ml-2 h-4 w-4" />
  //           ) : (
  //             <ArrowUpDown className="ml-2 h-4 w-4" />
  //           )}
  //         </Button>
  //       );
  //     },
  //   },
  //   {
  //     accessorKey: "deal.value",
  //     header: ({ column }) => {
  //       return (
  //         <Button
  //           variant="ghost"
  //           onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
  //           className="px-0"
  //         >
  //           Valor
  //           {column.getIsSorted() === "asc" ? (
  //             <ArrowUp className="ml-2 h-4 w-4" />
  //           ) : column.getIsSorted() === "desc" ? (
  //             <ArrowDown className="ml-2 h-4 w-4" />
  //           ) : (
  //             <ArrowUpDown className="ml-2 h-4 w-4" />
  //           )}
  //         </Button>
  //       );
  //     },
  //     cell: ({ row }) => {
  //       const value = parseFloat(row.original.deal.value) / 100;
  //       const currency = row.original.deal.currency;
  //       return formatCurrency(value, currency);
  //     },
  //   },
  //   {
  //     accessorKey: "deal.cdate",
  //     header: ({ column }) => {
  //       return (
  //         <Button
  //           variant="ghost"
  //           onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
  //           className="px-0"
  //         >
  //           Data de Criação
  //           {column.getIsSorted() === "asc" ? (
  //             <ArrowUp className="ml-2 h-4 w-4" />
  //           ) : column.getIsSorted() === "desc" ? (
  //             <ArrowDown className="ml-2 h-4 w-4" />
  //           ) : (
  //             <ArrowUpDown className="ml-2 h-4 w-4" />
  //           )}
  //         </Button>
  //       );
  //     },
  //     cell: ({ row }) => {
  //       const cdate = row.original.deal.cdate;
  //       return new Date(cdate).toLocaleDateString("pt-BR");
  //     },
  //   },
  //   {
  //     accessorKey: "deal.customField.value",
  //     header: ({ column }) => {
  //       return (
  //         <Button
  //           variant="ghost"
  //           onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
  //           className="px-0"
  //         >
  //           Data de Fechamento
  //           {column.getIsSorted() === "asc" ? (
  //             <ArrowUp className="ml-2 h-4 w-4" />
  //           ) : column.getIsSorted() === "desc" ? (
  //             <ArrowDown className="ml-2 h-4 w-4" />
  //           ) : (
  //             <ArrowUpDown className="ml-2 h-4 w-4" />
  //           )}
  //         </Button>
  //       );
  //     },
  //     cell: ({ row }) => {
  //       const closingDate = row.original.deal.customField.value;
  //       return new Date(closingDate).toLocaleDateString("pt-BR");
  //     },
  //   },
  // ];

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
          console.log("Pairs-sold: Custom date range selected:", {
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

        // Use cached API call with retry logic
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.deals) {
          setDeals(data.deals);

          // Calculate total value - divide by 100
          const total = data.deals.reduce((sum: number, item: Deal) => {
            return sum + (item.value || 0) / 100;
          }, 0);

          setTotalValue(total);

          // Calculate total pairs sold directly from quantidade-de-pares field
          const totalPairs = data.deals.reduce((sum: number, item: Deal) => {
            const quantidadePares = parseInt(
              item["quantidade-de-pares"] || "0"
            );
            return sum + quantidadePares;
          }, 0);

          setTotalPairsSold(totalPairs);

          // Calculate pairs sold per day based on working days (excluding weekends)
          let workingDays = 22; // default for 30 days (último mês)

          // Use parameters passed to function instead of global variables to avoid sync issues
          const isUsingCustomRange =
            customDateRange?.from && customDateRange?.to;
          const currentPeriod = selectedPeriod || period;

          console.log("Pairs-sold: Working days calculation:", {
            isUsingCustomRange,
            currentPeriod,
            customDateRange,
            selectedPeriod,
            globalPeriod: period,
            globalUseCustomPeriod: useCustomPeriod,
            globalDateRange: dateRange,
          });

          if (
            isUsingCustomRange &&
            customDateRange.from &&
            customDateRange.to
          ) {
            // For custom date range, calculate working days excluding weekends
            workingDays = 0;
            const currentDate = new Date(customDateRange.from);
            const endDate = new Date(customDateRange.to);

            while (currentDate <= endDate) {
              const dayOfWeek = currentDate.getDay();
              // 0 = Sunday, 6 = Saturday - exclude these
              if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                workingDays++;
              }
              currentDate.setDate(currentDate.getDate() + 1);
            }
          } else {
            // For fixed periods, use predefined working days
            if (currentPeriod === 60) {
              workingDays = 44; // 2 meses
            } else if (currentPeriod === 90) {
              workingDays = 66; // 3 meses
            }
            // currentPeriod === 30 already defaults to 22
          }

          const calculatedPairsSoldPerDay =
            workingDays > 0 ? Math.round(totalPairs / workingDays) : 0;

          console.log("Pairs-sold: Final calculation:", {
            totalPairs,
            workingDays,
            pairsSoldPerDay: calculatedPairsSoldPerDay,
          });

          setPairsSoldPerDay(calculatedPairsSoldPerDay);
        } else {
          setDeals([]);
          setTotalValue(0);
          setTotalPairsSold(0);
          setPairsSoldPerDay(0);
        }
      } catch (error) {
        console.error("Error fetching deals:", error);
        setDeals([]);
        setTotalValue(0);

        // Show user-friendly error message
        // You could add a toast notification here
      } finally {
        setLoading(false);
      }
    },
    [period, useCustomPeriod, dateRange] // Include all dependencies used in calculations
  );

  // Note: Total pairs sold is now calculated directly from deals data in fetchDeals function

  // Handle period change using global hook
  const handlePeriodChangeLocal = (newPeriod: number) => {
    handlePeriodChange(newPeriod); // This will clear dateRange and set useCustomPeriod to false
    fetchDeals(newPeriod);
  };

  // Handle custom date range change using global hook
  const handleDateRangeChangeLocal = (newDateRange: DateRange | undefined) => {
    handleDateRangeChange(newDateRange);
    if (newDateRange?.from && newDateRange?.to) {
      fetchDeals(undefined, newDateRange);
    }
  };

  // Initial data fetch using global date state - only after hydration
  useEffect(() => {
    if (!isHydrated) return;

    const initializeData = () => {
      if (useCustomPeriod && dateRange?.from && dateRange?.to) {
        // Use custom date range
        fetchDeals(undefined, dateRange);
      } else {
        // Use period-based filtering
        fetchDeals(period);
      }
    };

    initializeData();
  }, [period, useCustomPeriod, dateRange, fetchDeals, isHydrated]);

  // Function to refresh pairs sold data
  const refreshPairsSoldData = useCallback(() => {
    console.log("🔄 Pairs-sold: Refreshing data after sync...");
    if (useCustomPeriod && dateRange?.from && dateRange?.to) {
      fetchDeals(undefined, dateRange);
    } else {
      fetchDeals(period);
    }
  }, [useCustomPeriod, dateRange, period, fetchDeals]);

  // Register this page for automatic refresh after sync
  useDataRefresh("pairs-sold", refreshPairsSoldData);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <h1 className="text-xl sm:text-2xl font-bold">
        Pares Vendidos por Período
      </h1>

      {isHydrated && (
        <div className="flex flex-col gap-4 mb-4 mt-2">
          {/* Period Buttons - Stack on mobile, horizontal on larger screens */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
            <Button
              variant={
                !useCustomPeriod && period === 30 ? "default" : "outline"
              }
              onClick={() => handlePeriodChangeLocal(30)}
              className="w-full sm:w-auto"
            >
              Último mês
            </Button>
            <Button
              variant={
                !useCustomPeriod && period === 60 ? "default" : "outline"
              }
              onClick={() => handlePeriodChangeLocal(60)}
              className="w-full sm:w-auto"
            >
              Últimos 2 meses
            </Button>
            <Button
              variant={
                !useCustomPeriod && period === 90 ? "default" : "outline"
              }
              onClick={() => handlePeriodChangeLocal(90)}
              className="w-full sm:w-auto"
            >
              Últimos 3 meses
            </Button>
          </div>

          {/* Calendar Section - Stack on mobile */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <Label className="text-sm sm:text-base whitespace-nowrap">
              Selecione o período desejado:
            </Label>
            <div className="w-full sm:min-w-[250px] sm:w-auto">
              <Calendar23
                value={dateRange}
                onChange={handleDateRangeChangeLocal}
                hideLabel
              />
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">
              Total de Pares Vendidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-[200px]" />
            ) : (
              <p className="text-2xl sm:text-3xl font-bold">{totalPairsSold}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">
              Total de Pares Vendidos por Dia
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-[200px]" />
            ) : (
              <p className="text-2xl sm:text-3xl font-bold">
                {pairsSoldPerDay}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sync Checker - monitora sincronizações */}
      <SyncChecker />
    </div>
  );
}
