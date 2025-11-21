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

// Define the deal type based on the new API response structure
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
  "utm-source": string | null; // Field ID 49 (UTM Source)
  "utm-medium": string | null; // Field ID 50 (UTM Medium)
  contact_id: string | null;
  organization_id: string | null;
  api_updated_at: string | null;
}

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalValue, setTotalValue] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("all");

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

  // Função para converter string ISO para Date
  const parseISODate = (isoString: string): Date => {
    const datePart = isoString.split("T")[0];
    const [year, month, day] = datePart.split("-").map(Number);
    return new Date(year, month - 1, day); // month is 0-indexed
  };

  // Define columns for the data table
  const columns: ColumnDef<Deal>[] = [
    {
      accessorKey: "deal_id",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-0"
          >
            ID do Negócio
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
        return <div className="font-mono text-xs">{row.original.deal_id}</div>;
      },
    },
    {
      accessorKey: "title",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-0"
          >
            Título
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
    },
    {
      accessorKey: "status",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-0"
          >
            Status
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
        const status = row.original.status?.toLowerCase();
        let badgeColor = "bg-gray-100 text-gray-800";
        let statusText = "Desconhecido";

        if (status === "won" || status === "1") {
          badgeColor = "bg-green-100 text-green-800";
          statusText = "Ganho";
        } else if (status === "open" || status === "0") {
          badgeColor = "bg-blue-100 text-blue-800";
          statusText = "Em Andamento";
        } else if (status === "lost" || status === "2") {
          badgeColor = "bg-red-100 text-red-800";
          statusText = "Perdido";
        }

        return (
          <span
            className={`px-2 py-1 rounded-full text-xs font-medium ${badgeColor}`}
          >
            {statusText}
          </span>
        );
      },
    },
    {
      accessorKey: "value",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-0"
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
        // Divide by 100 to get real values and always use R$
        const value = (row.original.value || 0) / 100;
        return formatCurrency(value, "BRL");
      },
    },
    {
      accessorKey: "contact_id",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-0"
          >
            ID do Contato
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
        return (
          <div className="font-mono text-xs">
            {row.original.contact_id || "-"}
          </div>
        );
      },
    },
    {
      accessorKey: "created_date",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-0"
          >
            Data de Criação
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
        const createdDate = row.original.created_date;
        if (!createdDate) return "-";

        try {
          const date = parseISODate(createdDate);
          return date.toLocaleDateString("pt-BR");
        } catch {
          return "-";
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
            className="px-0"
          >
            Data de Fechamento
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
        const closingDate = row.original.closing_date;
        if (!closingDate) return "-";

        try {
          const date = parseISODate(closingDate);
          return date.toLocaleDateString("pt-BR");
        } catch {
          return "-";
        }
      },
    },
    {
      accessorKey: "estado",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-0"
          >
            Estado
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
        return row.original.estado || "-";
      },
    },
    {
      accessorKey: "quantidade-de-pares",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-0"
          >
            Quantidade de Pares
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
        return row.original["quantidade-de-pares"] || "-";
      },
    },
    {
      accessorKey: "vendedor",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-0"
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
        const vendedor = row.original.vendedor;
        return vendedor ? normalizeSellerName(vendedor) : "-";
      },
    },
    {
      accessorKey: "designer",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-0"
          >
            Designer
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
        return row.original.designer || "-";
      },
    },
    {
      accessorKey: "utm-source",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-0"
          >
            UTM Source
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
        return row.original["utm-source"] || "-";
      },
    },
    {
      accessorKey: "utm-medium",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="px-0"
          >
            UTM Medium
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
        return row.original["utm-medium"] || "-";
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
          console.log("Deals: Custom date range selected:", {
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

          // Calculate total value - divide by 100 to get real values
          const total = data.deals.reduce((sum: number, item: Deal) => {
            return sum + (item.value || 0) / 100;
          }, 0);

          setTotalValue(total);
        } else {
          setDeals([]);
          setTotalValue(0);
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
    []
  );

  // Handle period change using global hook
  const handlePeriodChangeLocal = (newPeriod: number) => {
    handlePeriodChange(newPeriod);
  };

  // Handle custom date range change using global hook
  const handleDateRangeChangeLocal = (newDateRange: DateRange | undefined) => {
    handleDateRangeChange(newDateRange);
  };

  // Initial data fetch using global date state
  useEffect(() => {
    const initializeData = async () => {
      // Only fetch data after hydration is complete
      if (!isHydrated) {
        console.log("⏳ Deals: Waiting for hydration...");
        return;
      }

      console.log("✅ Deals: Hydrated, fetching data...", {
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

  // Function to refresh deals data
  const refreshDealsData = useCallback(() => {
    console.log("🔄 Deals: Refreshing data after sync...");
    if (useCustomPeriod && dateRange?.from && dateRange?.to) {
      fetchDeals(undefined, dateRange);
    } else {
      fetchDeals(period);
    }
  }, [useCustomPeriod, dateRange, period, fetchDeals]);

  // Register this page for automatic refresh after sync
  useDataRefresh("deals", refreshDealsData);

  // Filter deals based on status
  const filteredDeals = deals.filter((deal) => {
    if (statusFilter === "all") return true;
    const status = deal.status?.toLowerCase();

    if (statusFilter === "won") {
      return status === "won" || status === "1";
    } else if (statusFilter === "open") {
      return status === "open" || status === "0";
    } else if (statusFilter === "lost") {
      return status === "lost" || status === "2";
    }

    return true;
  });

  // Calculate filtered total value
  const filteredTotalValue = filteredDeals.reduce((sum, deal) => {
    return sum + (deal.value || 0) / 100;
  }, 0);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <h1 className="text-xl sm:text-2xl font-bold">Negócios</h1>

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

        {/* Status Filter Buttons */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
          <Label className="text-sm sm:text-base whitespace-nowrap self-start sm:self-center">
            Filtrar por Status:
          </Label>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={statusFilter === "all" ? "default" : "outline"}
              onClick={() => setStatusFilter("all")}
              size="sm"
            >
              Todos ({deals.length})
            </Button>
            <Button
              variant={statusFilter === "won" ? "default" : "outline"}
              onClick={() => setStatusFilter("won")}
              size="sm"
              className={
                statusFilter === "won"
                  ? ""
                  : "border-green-500 text-green-700 hover:bg-green-50"
              }
            >
              Ganhos (
              {
                deals.filter(
                  (d) => d.status?.toLowerCase() === "won" || d.status === "1"
                ).length
              }
              )
            </Button>
            <Button
              variant={statusFilter === "open" ? "default" : "outline"}
              onClick={() => setStatusFilter("open")}
              size="sm"
              className={
                statusFilter === "open"
                  ? ""
                  : "border-blue-500 text-blue-700 hover:bg-blue-50"
              }
            >
              Em Andamento (
              {
                deals.filter(
                  (d) => d.status?.toLowerCase() === "open" || d.status === "0"
                ).length
              }
              )
            </Button>
            <Button
              variant={statusFilter === "lost" ? "default" : "outline"}
              onClick={() => setStatusFilter("lost")}
              size="sm"
              className={
                statusFilter === "lost"
                  ? ""
                  : "border-red-500 text-red-700 hover:bg-red-50"
              }
            >
              Perdidos (
              {
                deals.filter(
                  (d) => d.status?.toLowerCase() === "lost" || d.status === "2"
                ).length
              }
              )
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {statusFilter === "all"
              ? "Faturamento Total"
              : statusFilter === "won"
              ? "Faturamento Total (Ganhos)"
              : statusFilter === "open"
              ? "Valor Total (Em Andamento)"
              : "Valor Total (Perdidos)"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-8 w-[200px]" />
          ) : (
            <div className="space-y-2">
              <p className="text-3xl font-bold">
                {formatCurrency(filteredTotalValue, "BRL")}
              </p>
              {statusFilter !== "all" && (
                <p className="text-sm text-muted-foreground">
                  {filteredDeals.length} de {deals.length} negócios
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <DataTable columns={columns} data={filteredDeals} />
      )}

      {/* Sync Checker - monitora sincronizações */}
      <SyncChecker />
    </div>
  );
}
