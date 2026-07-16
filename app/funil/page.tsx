"use client";

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AlertCircle, RefreshCw, Split } from "lucide-react";
import {
  FunnelChart,
  type FunnelStage as ChartStage,
} from "@/components/charts/funnel-chart";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import Calendar23 from "@/components/calendar-23";
import type { DateRange } from "react-day-picker";
import { useGlobalDateRange } from "@/hooks/useGlobalDateRange";
import { storage } from "@/lib/storage";

const HEATMAP_COLORS = [
  "#0066FF",
  "#00CFFF",
  "#00E676",
  "#FFE600",
  "#FF8A00",
  "#FF1F1F",
] as const;

interface ApiFunnelStage {
  slug: string;
  label: string;
  value: number;
}

interface ApiFunnel {
  id: "with_mockup" | "without_mockup";
  title: string;
  stages: ApiFunnelStage[];
  active: boolean;
  lastEventAt: string | null;
}

interface FunnelResponse {
  funnels: {
    withMockup: ApiFunnel;
    withoutMockup: ApiFunnel;
  };
  meta: {
    totalEvents: number;
    totalContacts: number;
    unassignedContacts: number;
    ambiguousContacts: number;
    lastEventAt: string | null;
    generatedAt: string;
    range: { from: string; to: string } | null;
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

// White label with a dark halo: readable both over the funnel colors and
// over the page background when the funnel narrows.
const LABEL_STYLE: CSSProperties = {
  color: "#FFFFFF",
  textShadow: "0 0 6px rgba(2,6,23,0.7), 0 1px 2px rgba(2,6,23,0.6)",
};

function toChartData(stages: ApiFunnelStage[]): {
  data: ChartStage[];
  isEmpty: boolean;
} {
  const isEmpty = stages.every((stage) => stage.value === 0);

  return {
    isEmpty,
    data: stages.map((stage, index) => ({
      label: stage.label,
      // Keep the component visible before the first webhook while displaying 0.
      value: isEmpty ? stages.length - index : stage.value,
      displayValue: formatNumber(stage.value),
      color: HEATMAP_COLORS[index] ?? HEATMAP_COLORS.at(-1),
      labelStyle: LABEL_STYLE,
    })),
  };
}

function FunnelPanel({ funnel }: { funnel: ApiFunnel }) {
  const { data, isEmpty } = useMemo(
    () => toChartData(funnel.stages),
    [funnel.stages],
  );
  const isMobile = useIsMobile() ?? false;

  return (
    <section className="overflow-hidden rounded-3xl border border-border/60 bg-card/60 shadow-sm backdrop-blur-sm">
      <div className="border-b border-border/50 px-6 py-5 sm:px-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Teste A/B
          </p>
          <div className="flex items-center gap-3">
            <h2 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
              {funnel.title}
            </h2>
            {funnel.active ? (
              <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-500">
                Ativo
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                Desativado
              </span>
            )}
          </div>
          {funnel.lastEventAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              último webhook:{" "}
              {new Intl.DateTimeFormat("pt-BR", {
                dateStyle: "short",
                timeStyle: "short",
                timeZone: "America/Sao_Paulo",
              }).format(new Date(funnel.lastEventAt))}
            </p>
          )}
        </div>
      </div>

      <div
        className={
          isMobile
            ? "px-5 py-8 sm:px-8 sm:py-10"
            : "overflow-x-auto px-5 py-8 sm:px-8 sm:py-10"
        }
      >
        <div
          className={
            isMobile
              ? "mx-auto w-full max-w-[420px]"
              : "mx-auto min-w-[960px] max-w-[1280px]"
          }
        >
          <FunnelChart
            data={data}
            edges="straight"
            formatPercentage={isEmpty ? () => "0%" : undefined}
            gap={0}
            layers={5}
            orientation={isMobile ? "vertical" : "horizontal"}
            labelLayout="grouped"
            labelOrientation="vertical"
            labelAlign="center"
            showLabels
            showPercentage
            showValues
            staggerDelay={0.09}
            style={isMobile ? undefined : { aspectRatio: "3.45 / 1" }}
          />
        </div>
      </div>
    </section>
  );
}

function FunnelSkeleton() {
  return (
    <div className="space-y-5 rounded-3xl border border-border/60 bg-card/60 p-6 sm:p-8">
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-7 w-56" />
      </div>
      <Skeleton className="h-72 w-full rounded-2xl" />
    </div>
  );
}

export default function FunilPage() {
  const {
    dateRange,
    period,
    useCustomPeriod,
    isHydrated,
    handleDateRangeChange,
    handlePeriodChange,
    getApiUrl,
  } = useGlobalDateRange();
  const [statusFilter, setStatusFilter] = useState<"all" | "active">("all");
  const [data, setData] = useState<FunnelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = storage.getItem("funilStatusFilter");
    if (stored === "active" || stored === "all") {
      setStatusFilter(stored);
    }
  }, []);

  const handleStatusFilterChange = (value: "all" | "active") => {
    setStatusFilter(value);
    storage.setItem("funilStatusFilter", value);
  };

  const loadFunnels = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await fetch(getApiUrl("/api/ghl/funnel"), { cache: "no-store" });
      const body = (await response.json()) as FunnelResponse & { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Não foi possível carregar os funis");
      }
      setData(body);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar os funis",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getApiUrl]);

  useEffect(() => {
    if (!isHydrated) return;
    loadFunnels();
    const interval = window.setInterval(() => loadFunnels(true), 30_000);
    return () => window.clearInterval(interval);
  }, [loadFunnels, isHydrated]);

  const handlePeriodChangeLocal = (newPeriod: number) => {
    handlePeriodChange(newPeriod);
  };

  const handleDateRangeChangeLocal = (newDateRange: DateRange | undefined) => {
    handleDateRangeChange(newDateRange);
  };

  const visibleFunnels = data
    ? [data.funnels.withMockup, data.funnels.withoutMockup].filter(
        (f) => statusFilter === "all" || f.active,
      )
    : [];

  const lastEventLabel = data?.meta.lastEventAt
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(new Date(data.meta.lastEventAt))
    : "aguardando o primeiro webhook";

  return (
    <main className="relative flex flex-1 overflow-hidden px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(0,102,255,0.08),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(255,31,31,0.06),transparent_30%)]" />

      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-8">
        <header className="relative flex flex-col items-center justify-center text-center">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/15 bg-primary/5 text-primary">
            <Split className="h-5 w-5" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Funil de Conversão
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
            Progressão dos contatos nos dois caminhos do teste A/B, atualizada
            automaticamente pelos webhooks do GHL.
          </p>

          <Button
            aria-label="Atualizar funis"
            className="mt-5 gap-2 sm:absolute sm:right-0 sm:top-0 sm:mt-0"
            disabled={loading || refreshing}
            onClick={() => loadFunnels(true)}
            size="sm"
            variant="outline"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            Atualizar
          </Button>
        </header>

        <div className="flex flex-col items-center gap-3 lg:flex-row lg:justify-center">
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              variant={!useCustomPeriod && period === 30 ? "default" : "outline"}
              size="sm"
              onClick={() => handlePeriodChangeLocal(30)}
            >
              Último mês
            </Button>
            <Button
              variant={!useCustomPeriod && period === 60 ? "default" : "outline"}
              size="sm"
              onClick={() => handlePeriodChangeLocal(60)}
            >
              Últimos 2 meses
            </Button>
            <Button
              variant={!useCustomPeriod && period === 90 ? "default" : "outline"}
              size="sm"
              onClick={() => handlePeriodChangeLocal(90)}
            >
              Últimos 3 meses
            </Button>
          </div>

          <Calendar23 value={dateRange} onChange={handleDateRangeChangeLocal} hideLabel />

          <div className="flex gap-2">
            <Button
              variant={statusFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => handleStatusFilterChange("all")}
            >
              Todos os funis
            </Button>
            <Button
              variant={statusFilter === "active" ? "default" : "outline"}
              size="sm"
              onClick={() => handleStatusFilterChange("active")}
            >
              Somente ativos
            </Button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="grid gap-8">
            <FunnelSkeleton />
            <FunnelSkeleton />
          </div>
        ) : data ? (
          <div className="grid gap-8 lg:gap-10">
            {visibleFunnels.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">
                Nenhum funil ativo no momento.
              </p>
            ) : (
              visibleFunnels.map((f) => <FunnelPanel key={f.id} funnel={f} />)
            )}
          </div>
        ) : null}

        {!loading && data && (
          <p className="text-center text-xs text-muted-foreground">
            {formatNumber(data.meta.totalEvents)}{" "}
            {data.meta.range
              ? "webhooks no período selecionado"
              : "webhooks recebidos"}{" "}
            • último evento: {lastEventLabel}
          </p>
        )}
      </div>
    </main>
  );
}
