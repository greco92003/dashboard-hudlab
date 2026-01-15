"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import Calendar23 from "@/components/calendar-23";
import { DateRange } from "react-day-picker";
import { Label } from "@/components/ui/label";
import { useGlobalDateRange } from "@/hooks/useGlobalDateRange";
import { SyncChecker } from "@/components/ui/sync-checker";
import { useDataRefresh } from "@/hooks/useDataRefresh";
import { normalizeSellerName } from "@/lib/utils/normalize-names";
import { BusinessDaysCalculator } from "@/components/business-days-calculator";

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
}

interface SellerStats {
  name: string;
  totalValue: number;
  totalPairs: number;
  dealsCount: number;
}

export default function SellersPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalValue, setTotalValue] = useState(0);
  const [topSellers, setTopSellers] = useState<SellerStats[]>([]);

  // Use global date range hook
  const {
    dateRange,
    period,
    useCustomPeriod,
    isHydrated,
    handleDateRangeChange,
    handlePeriodChange,
  } = useGlobalDateRange();

  // Helper function to format date as local YYYY-MM-DD without timezone conversion
  const formatDateToLocal = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Função para converter string ISO para Date
  const parseISODate = (isoString: string): Date => {
    const datePart = isoString.split("T")[0];
    const [year, month, day] = datePart.split("-").map(Number);
    return new Date(year, month - 1, day); // month is 0-indexed
  };

  // Define columns for the data table
  const columns: ColumnDef<Deal>[] = [
    {
      accessorKey: "vendedor",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-auto p-0 font-semibold"
          >
            Vendedor
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        );
      },
      cell: ({ row }) => {
        const vendedor = row.getValue("vendedor") as string;
        const normalizedVendedor = vendedor
          ? normalizeSellerName(vendedor)
          : "Não informado";
        return <div className="font-medium">{normalizedVendedor}</div>;
      },
    },
    {
      accessorKey: "title",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-auto p-0 font-semibold"
          >
            Negócio
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        );
      },
      cell: ({ row }) => {
        const title = row.getValue("title") as string;
        return <div className="max-w-[200px] truncate">{title}</div>;
      },
    },
    {
      accessorKey: "value",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-auto p-0 font-semibold"
          >
            Valor
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        );
      },
      cell: ({ row }) => {
        const value = row.getValue("value") as number;
        // Divide by 100 to get real values (database stores values multiplied by 100)
        const realValue = (value || 0) / 100;
        return (
          <div className="font-medium">{formatCurrency(realValue, "BRL")}</div>
        );
      },
    },
    {
      accessorKey: "quantidade-de-pares",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-auto p-0 font-semibold"
          >
            Pares
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        );
      },
      cell: ({ row }) => {
        const pares = row.getValue("quantidade-de-pares") as string;
        return <div className="text-center">{pares || "0"}</div>;
      },
    },
    {
      accessorKey: "created_date",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-auto p-0 font-semibold"
          >
            Data Criação
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        );
      },
      cell: ({ row }) => {
        const createdDate = row.getValue("created_date") as string;
        if (!createdDate) return <div>-</div>;

        try {
          const date = parseISODate(createdDate);
          return <div>{date.toLocaleDateString("pt-BR")}</div>;
        } catch {
          return <div>-</div>;
        }
      },
    },
    {
      accessorKey: "closing_date",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-auto p-0 font-semibold"
          >
            Data Fechamento
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        );
      },
      cell: ({ row }) => {
        const closingDate = row.getValue("closing_date") as string;
        if (!closingDate) return <div>-</div>;

        try {
          const date = parseISODate(closingDate);
          return <div>{date.toLocaleDateString("pt-BR")}</div>;
        } catch {
          return <div>-</div>;
        }
      },
    },
  ];

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
          console.log("Sellers: Custom date range selected:", {
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
          // Filtrar apenas deals que têm vendedor
          const dealsWithSellers = data.deals.filter(
            (deal: Deal) => deal.vendedor && deal.vendedor.trim() !== ""
          );
          setDeals(dealsWithSellers);

          // Calculate total value - divide by 100 to get real values
          const total = dealsWithSellers.reduce((sum: number, deal: any) => {
            return sum + (deal.value || 0) / 100;
          }, 0);
          setTotalValue(total);

          // Calculate seller statistics
          const sellerStats = dealsWithSellers.reduce((acc: any, deal: any) => {
            const rawSellerName = deal.vendedor || "Não informado";
            const sellerName = normalizeSellerName(rawSellerName);
            const dealValue = (deal.value || 0) / 100;
            const dealPairs = parseInt(deal["quantidade-de-pares"] || "0");

            if (!acc[sellerName]) {
              acc[sellerName] = {
                name: sellerName,
                totalValue: 0,
                totalPairs: 0,
                dealsCount: 0,
              };
            }

            acc[sellerName].totalValue += dealValue;
            acc[sellerName].totalPairs += dealPairs;
            acc[sellerName].dealsCount += 1;

            return acc;
          }, {} as Record<string, SellerStats>);

          // Convert to array and sort by total value (descending)
          const sortedSellers = Object.values(sellerStats)
            .sort((a: any, b: any) => b.totalValue - a.totalValue)
            .slice(0, 3); // Get top 3 sellers

          setTopSellers(sortedSellers as SellerStats[]);
        } else {
          setDeals([]);
          setTotalValue(0);
          setTopSellers([]);
        }
      } catch (error) {
        console.error("Error fetching deals:", error);
        setDeals([]);
        setTotalValue(0);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Handle period change (local function to maintain state)
  const handlePeriodChangeLocal = (newPeriod: number) => {
    handlePeriodChange(newPeriod);
  };

  // Handle date range change (local function to maintain state)
  const handleDateRangeChangeLocal = (range: DateRange | undefined) => {
    handleDateRangeChange(range);
  };

  useEffect(() => {
    const initializeData = async () => {
      // Only fetch data after hydration is complete
      if (!isHydrated) {
        console.log("⏳ Sellers: Waiting for hydration...");
        return;
      }

      console.log("✅ Sellers: Hydrated, fetching data...", {
        useCustomPeriod,
        period,
        dateRange,
      });

      if (!useCustomPeriod) {
        await fetchDeals(period);
      } else {
        await fetchDeals(period, dateRange);
      }
    };

    initializeData();
  }, [period, useCustomPeriod, dateRange, fetchDeals, isHydrated]);

  // Function to refresh sellers data
  const refreshSellersData = useCallback(() => {
    console.log("🔄 Sellers: Refreshing data after sync...");
    if (useCustomPeriod && dateRange?.from && dateRange?.to) {
      fetchDeals(undefined, dateRange);
    } else {
      fetchDeals(period);
    }
  }, [useCustomPeriod, dateRange, period, fetchDeals]);

  // Register this page for automatic refresh after sync
  useDataRefresh("sellers", refreshSellersData);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <h1 className="text-xl sm:text-2xl font-bold">Vendedores</h1>

      {/* Card da Calculadora de Dias Úteis */}
      <BusinessDaysCalculator />

      <div className="flex flex-col gap-4 mb-4 mt-2">
        {/* Period Buttons - Stack on mobile, horizontal on larger screens */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
          <Button
            variant={!useCustomPeriod && period === 30 ? "default" : "outline"}
            onClick={() => handlePeriodChangeLocal(30)}
            className="w-full sm:w-auto"
          >
            Último mês
          </Button>
          <Button
            variant={!useCustomPeriod && period === 60 ? "default" : "outline"}
            onClick={() => handlePeriodChangeLocal(60)}
            className="w-full sm:w-auto"
          >
            Últimos 2 meses
          </Button>
          <Button
            variant={!useCustomPeriod && period === 90 ? "default" : "outline"}
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

      <div className="mb-4">
        <p className="text-xs sm:text-sm text-muted-foreground">
          Total de vendas: {formatCurrency(totalValue, "BRL")} | {deals.length}{" "}
          negócios
        </p>
      </div>

      {/* Top Sellers Cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {topSellers.map((seller, index) => (
            <Card key={seller.name} className="relative overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base sm:text-lg font-semibold truncate">
                    {seller.name}
                  </CardTitle>
                  <div className="flex items-center justify-center w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-primary/10 text-primary font-bold text-xs sm:text-sm">
                    #{index + 1}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs sm:text-sm text-muted-foreground">
                      Total Vendido:
                    </span>
                    <span className="font-semibold text-green-600 text-xs sm:text-sm">
                      {formatCurrency(seller.totalValue, "BRL")}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs sm:text-sm text-muted-foreground">
                      Pares Vendidos:
                    </span>
                    <span className="font-semibold text-blue-600 text-xs sm:text-sm">
                      {seller.totalPairs.toLocaleString()} pares
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs sm:text-sm text-muted-foreground">
                      Negócios:
                    </span>
                    <span className="font-semibold text-purple-600">
                      {seller.dealsCount}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Fill empty slots if less than 3 sellers */}
          {topSellers.length < 3 &&
            Array.from({ length: 3 - topSellers.length }).map((_, index) => (
              <Card key={`empty-${index}`} className="opacity-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg font-semibold text-muted-foreground">
                    Vendedor #{topSellers.length + index + 1}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">
                        Total Vendido:
                      </span>
                      <span className="font-semibold text-muted-foreground">
                        {formatCurrency(0, "BRL")}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">
                        Pares Vendidos:
                      </span>
                      <span className="font-semibold text-muted-foreground">
                        0 pares
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">
                        Negócios:
                      </span>
                      <span className="font-semibold text-muted-foreground">
                        0
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <DataTable columns={columns} data={deals} />
      )}

      {/* Sync Checker - monitora sincronizações */}
      <SyncChecker />
    </div>
  );
}
