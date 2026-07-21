"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ColumnDef } from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  FileText,
  Palette,
  RefreshCw,
} from "lucide-react";
import { DateRange } from "react-day-picker";
import Calendar23 from "@/components/calendar-23";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useGlobalDateRange } from "@/hooks/useGlobalDateRange";

type ActionType = "mockup" | "alteration" | "other";

interface DesignerAction {
  id: string;
  date: string;
  designer: string;
  stage: string;
  actionType: ActionType;
  name: string;
  email: string;
  utm2: string;
}

interface DesignerStats {
  name: string;
  mockups: number;
  alterations: number;
  otherActions: number;
  total: number;
}

function formatDateToLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatActionDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("pt-BR");
}

function SortableHeader({
  column,
  children,
}: {
  column: {
    toggleSorting: (descending?: boolean) => void;
    getIsSorted: () => false | "asc" | "desc";
  };
  children: ReactNode;
}) {
  const sorting = column.getIsSorted();
  return (
    <Button
      variant="ghost"
      onClick={() => column.toggleSorting(sorting === "asc")}
      className="h-auto p-0 font-semibold"
    >
      {children}
      {sorting === "asc" ? (
        <ArrowUp className="ml-2 h-4 w-4" />
      ) : sorting === "desc" ? (
        <ArrowDown className="ml-2 h-4 w-4" />
      ) : (
        <ArrowUpDown className="ml-2 h-4 w-4" />
      )}
    </Button>
  );
}

export default function DesignersGhlPage() {
  const [actions, setActions] = useState<DesignerAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    dateRange,
    period,
    useCustomPeriod,
    isHydrated,
    handleDateRangeChange,
    handlePeriodChange,
  } = useGlobalDateRange();

  const columns = useMemo<ColumnDef<DesignerAction>[]>(
    () => [
      {
        accessorKey: "designer",
        header: ({ column }) => (
          <SortableHeader column={column}>Designer</SortableHeader>
        ),
        cell: ({ row }) => (
          <div className="font-medium">{row.original.designer}</div>
        ),
      },
      {
        accessorKey: "stage",
        header: ({ column }) => (
          <SortableHeader column={column}>Etapa</SortableHeader>
        ),
        cell: ({ row }) => (
          <span
            className={
              row.original.actionType === "mockup"
                ? "font-medium text-green-600"
                : row.original.actionType === "alteration"
                  ? "font-medium text-orange-600"
                  : "font-medium"
            }
          >
            {row.original.stage}
          </span>
        ),
      },
      {
        accessorKey: "name",
        header: ({ column }) => (
          <SortableHeader column={column}>Contato</SortableHeader>
        ),
        cell: ({ row }) => row.original.name || "-",
      },
      {
        accessorKey: "email",
        header: "E-mail",
        cell: ({ row }) => (
          <div className="max-w-[240px] truncate">{row.original.email || "-"}</div>
        ),
      },
      {
        accessorKey: "utm2",
        header: "UTM2",
        cell: ({ row }) => (
          <div className="max-w-[220px] truncate">{row.original.utm2 || "-"}</div>
        ),
      },
      {
        accessorKey: "date",
        header: ({ column }) => (
          <SortableHeader column={column}>Data da ação</SortableHeader>
        ),
        cell: ({ row }) => formatActionDate(row.original.date),
      },
    ],
    [],
  );

  const fetchActions = useCallback(
    async (forceRefresh = false, signal?: AbortSignal) => {
      if (!isHydrated) return;

      if (forceRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        if (useCustomPeriod && dateRange?.from && dateRange?.to) {
          params.set("startDate", formatDateToLocal(dateRange.from));
          params.set("endDate", formatDateToLocal(dateRange.to));
        } else {
          params.set("period", String(period));
        }
        if (forceRefresh) params.set("refresh", "1");

        const response = await fetch(`/api/designers-ghl?${params.toString()}`, {
          cache: "no-store",
          signal,
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Erro ao carregar dados");
        }

        setActions(result.actions || []);
      } catch (fetchError) {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") {
          return;
        }
        console.error("Error fetching GHL designer data:", fetchError);
        setActions([]);
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Não foi possível carregar os dados.",
        );
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [dateRange, isHydrated, period, useCustomPeriod],
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetchActions(false, controller.signal);
    return () => controller.abort();
  }, [fetchActions]);

  const designerStats = useMemo(() => {
    const stats = new Map<string, DesignerStats>();

    actions.forEach((action) => {
      const current = stats.get(action.designer) || {
        name: action.designer,
        mockups: 0,
        alterations: 0,
        otherActions: 0,
        total: 0,
      };

      if (action.actionType === "mockup") current.mockups += 1;
      else if (action.actionType === "alteration") current.alterations += 1;
      else current.otherActions += 1;
      current.total += 1;
      stats.set(action.designer, current);
    });

    return [...stats.values()].sort(
      (a, b) => b.total - a.total || a.name.localeCompare(b.name),
    );
  }, [actions]);

  const totals = useMemo(
    () => ({
      mockups: actions.filter((action) => action.actionType === "mockup").length,
      alterations: actions.filter(
        (action) => action.actionType === "alteration",
      ).length,
    }),
    [actions],
  );

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Designers GHL</h1>
          <p className="text-sm text-muted-foreground">
            Ações de mockup e alteração registradas no GHL
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void fetchActions(true)}
          disabled={loading || refreshing}
          className="w-full gap-2 sm:w-auto"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Atualizando..." : "Atualizar dados"}
        </Button>
      </div>

      <div className="flex flex-col gap-4 py-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
          {[30, 60, 90].map((days) => (
            <Button
              key={days}
              variant={!useCustomPeriod && period === days ? "default" : "outline"}
              onClick={() => handlePeriodChange(days)}
              className="w-full sm:w-auto"
            >
              {days === 30
                ? "Último mês"
                : days === 60
                  ? "Últimos 2 meses"
                  : "Últimos 3 meses"}
            </Button>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <Label className="whitespace-nowrap text-sm sm:text-base">
            Selecione o período desejado:
          </Label>
          <div className="w-full sm:w-auto sm:min-w-[250px]" suppressHydrationWarning>
            <Calendar23
              value={dateRange}
              onChange={(range: DateRange | undefined) => handleDateRangeChange(range)}
              hideLabel
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="gap-2 py-5">
            <CardHeader className="flex-row items-center justify-between pb-0">
              <CardTitle className="text-sm text-muted-foreground">Total de ações</CardTitle>
              <Palette className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent className="text-3xl font-bold">{actions.length}</CardContent>
          </Card>
          <Card className="gap-2 py-5">
            <CardHeader className="flex-row items-center justify-between pb-0">
              <CardTitle className="text-sm text-muted-foreground">Mockups prontos</CardTitle>
              <FileText className="h-5 w-5 text-green-600" />
            </CardHeader>
            <CardContent className="text-3xl font-bold text-green-600">
              {totals.mockups}
            </CardContent>
          </Card>
          <Card className="gap-2 py-5">
            <CardHeader className="flex-row items-center justify-between pb-0">
              <CardTitle className="text-sm text-muted-foreground">Alterações prontas</CardTitle>
              <FileText className="h-5 w-5 text-orange-600" />
            </CardHeader>
            <CardContent className="text-3xl font-bold text-orange-600">
              {totals.alterations}
            </CardContent>
          </Card>
        </div>
      )}

      <section className="mt-2">
        <h2 className="mb-4 text-lg font-semibold sm:text-xl">Desempenho por designer</h2>
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-36 w-full" />
          </div>
        ) : designerStats.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {designerStats.map((designer, index) => (
              <Card key={designer.name} className="gap-3 py-5">
                <CardHeader className="flex-row items-center justify-between pb-0">
                  <CardTitle className="truncate text-base sm:text-lg">
                    {designer.name}
                  </CardTitle>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    #{index + 1}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Mockups prontos</span>
                    <span className="font-semibold text-green-600">{designer.mockups}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Alterações prontas</span>
                    <span className="font-semibold text-orange-600">
                      {designer.alterations}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t pt-2 text-sm">
                    <span className="font-semibold">Total</span>
                    <span className="font-bold text-primary">{designer.total}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhuma ação de designer encontrada no período selecionado.
            </CardContent>
          </Card>
        )}
      </section>

      <Card className="mt-2">
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl">Ações detalhadas</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-64 w-full" /> : <DataTable columns={columns} data={actions} />}
        </CardContent>
      </Card>
    </div>
  );
}
