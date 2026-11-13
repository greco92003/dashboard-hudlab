"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/chart";
import { formatCurrency } from "@/lib/utils";
import { Activity, RefreshCw, TrendingUp, Target, Zap, BarChart3 } from "lucide-react";

function LiveDot() {
  return (
    <span className="relative flex h-3 w-3">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
      <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
    </span>
  );
}
import { Skeleton } from "@/components/ui/skeleton";
import { IntegrationHealthNotice } from "@/components/integration-health-notice";
import { CabecalhoDaPagina } from "@/components/hud/pagina";

interface ChartDataPoint {
  date: string;
  day: number;
  revenue: number | null;
  meta: number;
  forecast: number | null;
  pace: number | null;
}

interface DashboardData {
  month: number;
  year: number;
  todayDay: number;
  todayDate: string;
  startDay: number;
  totalDaysInMonth: number;
  countedDays: number;
  elapsedDays: number;
  startDate: string;
  endDate: string;
  monthlyTarget: number;
  totalRevenue: number;
  totalForecast: number;
  chartData: ChartDataPoint[];
}

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const chartConfig = {
  revenue: { label: "Faturamento", color: "var(--tone-green)" },
  meta: { label: "Meta", color: "var(--tone-slate)" },
  forecast: { label: "Forecast", color: "var(--tone-violet)" },
  pace: { label: "Pace", color: "var(--tone-sky)" },
} satisfies ChartConfig;

function useUTC3Clock() {
  const [time, setTime] = useState("");
  const [dateStr, setDateStr] = useState("");

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const utcMinus3 = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      setTime(
        utcMinus3.getUTCHours().toString().padStart(2, "0") +
          ":" +
          utcMinus3.getUTCMinutes().toString().padStart(2, "0") +
          ":" +
          utcMinus3.getUTCSeconds().toString().padStart(2, "0"),
      );
      setDateStr(
        utcMinus3.getUTCDate().toString().padStart(2, "0") +
          "/" +
          (utcMinus3.getUTCMonth() + 1).toString().padStart(2, "0") +
          "/" +
          utcMinus3.getUTCFullYear(),
      );
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return { time, dateStr };
}

export default function LiveDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchInProgress = useRef(false);
  const { time, dateStr } = useUTC3Clock();

  const fetchData = useCallback(async () => {
    if (fetchInProgress.current) return;
    fetchInProgress.current = true;
    try {
      const res = await fetch("/api/live-dashboard", { cache: "no-store" });
      if (!res.ok) throw new Error(`Live dashboard request failed: ${res.status}`);
      const json = await res.json();
      if (json.success) setData(json);
    } catch (err) {
      console.error("Error fetching live dashboard:", err);
    } finally {
      fetchInProgress.current = false;
      setLoading(false);
    }
  }, []);

  // Keep the dashboard current even when the CRM webhook or Realtime is delayed.
  useEffect(() => {
    fetchData();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") fetchData();
    }, 30_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") fetchData();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [fetchData]);

  const formatDay = (dateStr: string) => {
    const [, month, day] = dateStr.split("-");
    return day === "01" ? `${day}/${month}` : String(Number(day));
  };

  const currentPace = data
    ? data.elapsedDays > 0
      ? (data.totalRevenue / data.elapsedDays) * data.countedDays
      : 0
    : 0;

  return (
    <div className="flex flex-1 flex-col gap-4 md:gap-5">
      <CabecalhoDaPagina
        icone={Activity}
        titulo={
          <span className="flex items-center gap-2.5">
            Live Dashboard
            <LiveDot />
            <IntegrationHealthNotice />
            {loading && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
          </span>
        }
        descricao={
          data
            ? `${MONTH_NAMES[data.month - 1]} ${data.year} · ciclo de ${data.startDate.slice(8, 10)}/${data.startDate.slice(5, 7)} a ${data.endDate.slice(8, 10)}/${data.endDate.slice(5, 7)}`
            : "Faturamento do ciclo em tempo real"
        }
        acoes={
          <div className="hud-panel px-4 py-2 text-right">
            <div className="font-mono text-2xl font-bold tabular-nums sm:text-3xl">{time}</div>
            <div className="text-xs text-muted-foreground sm:text-sm">{dateStr}</div>
          </div>
        }
      />

      {/* KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : data ? (
        <div className="hud-panel hud-strip grid-cols-2 lg:grid-cols-4">
          <KPICard icon={TrendingUp} label="Faturamento" value={formatCurrency(data.totalRevenue)} tom="tone-green" />
          <KPICard icon={Target} label="Meta" value={formatCurrency(data.monthlyTarget)} tom="tone-slate" />
          <KPICard icon={BarChart3} label="Pace" value={formatCurrency(currentPace)} tom="tone-sky" />
          <KPICard icon={Zap} label="Forecast" value={formatCurrency(data.totalForecast)} tom="tone-violet" />
        </div>
      ) : null}

      {/* Chart */}
      {loading ? (
        <Skeleton className="h-[500px]" />
      ) : data ? (
        <LiveChart data={data} formatDay={formatDay} />
      ) : (
        <p className="text-center text-muted-foreground py-12">
          Erro ao carregar dados.
        </p>
      )}
    </div>
  );
}

/**
 * Célula da faixa de indicadores, tingida pela cor da linha correspondente no
 * gráfico (fundo translúcido, brilho no canto e o ícone em marca d'água).
 */
function KPICard({
  icon: Icone,
  label,
  value,
  tom,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tom: string;
}) {
  return (
    <div className={`${tom} hud-strip-tinto`}>
      <Icone className="hud-strip-marca" />
      <span className="hud-strip-label">
        <Icone className="hud-tone-text h-4 w-4" />
        {label}
      </span>
      <span className="hud-strip-value hud-tone-text">{value}</span>
    </div>
  );
}

function LiveChart({
  data,
  formatDay,
}: {
  data: DashboardData;
  formatDay: (d: string) => string;
}) {
  // Calculate Y-axis max based on meta, pace and revenue only (ignore forecast)
  const otherMax = data.chartData.reduce((acc, point) => {
    const vals = [point.meta ?? 0, point.pace ?? 0, point.revenue ?? 0];
    return Math.max(acc, ...vals);
  }, 0);
  // Add 15% headroom so lines don't hit the ceiling
  const yAxisMax = Math.ceil((otherMax * 1.15) / 10000) * 10000 || 100000;

  // Latest non-null forecast value from chart data
  const forecastValue = data.totalForecast ?? 0;
  const forecastOverflow = forecastValue > yAxisMax;

  // Clamp forecast values so they don't blow the axis; keep original for tooltip
  const clampedChartData = data.chartData.map((point) => ({
    ...point,
    forecastOriginal: point.forecast, // real value for tooltip display
    forecast:
      point.forecast !== null ? Math.min(point.forecast, yAxisMax) : null,
  }));

  return (
    <Card className="flex-1">
      <CardHeader className="py-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <CardTitle className="text-base sm:text-lg">
            Performance do Ciclo — {data.startDate.slice(8, 10)}/
            {data.startDate.slice(5, 7)} a {data.endDate.slice(8, 10)}/
            {data.endDate.slice(5, 7)}
          </CardTitle>
          {/* Forecast overflow badge — only shown when forecast exceeds chart scale */}
          {forecastOverflow && (
            <div className="tone-violet hud-tone-chip flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold">
              <span className="hud-tone-dot inline-block h-2 w-2 rounded-full" />
              Forecast&nbsp;
              <span className="font-mono">{formatCurrency(forecastValue)}</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 pt-0">
        <ChartContainer config={chartConfig} className="h-[420px] w-full">
          <AreaChart
            data={clampedChartData}
            margin={{ left: 12, right: 12, top: 12, bottom: 12 }}
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={formatDay}
            />
            <YAxis
              tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              domain={[0, yAxisMax]}
            />
            <ChartTooltip
              cursor={false}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const d = payload[0]?.payload;
                  return (
                    <div className="border-border/50 bg-background rounded-lg border px-3 py-2 text-sm shadow-xl space-y-1">
                      <p className="font-medium">
                        {d.date.slice(8, 10)}/{d.date.slice(5, 7)}
                      </p>
                      {d.revenue !== null && (
                        <p className="tone-green hud-tone-text">
                          Faturamento: {formatCurrency(d.revenue)}
                        </p>
                      )}
                      <p className="tone-slate hud-tone-text">
                        Meta: {formatCurrency(d.meta)}
                      </p>
                      {d.forecastOriginal !== null &&
                        d.forecastOriginal !== undefined && (
                          <p className="tone-violet hud-tone-text">
                            Forecast: {formatCurrency(d.forecastOriginal)}
                            {d.forecastOriginal > yAxisMax && (
                              <span className="ml-1 text-xs">
                                ↑
                              </span>
                            )}
                          </p>
                        )}
                      {d.pace !== null && (
                        <p className="tone-sky hud-tone-text">
                          Pace: {formatCurrency(d.pace)}
                        </p>
                      )}
                    </div>
                  );
                }
                return null;
              }}
            />
            <defs>
              <linearGradient id="fillRevenueLive" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--tone-green)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--tone-green)" stopOpacity={0.03} />
              </linearGradient>
            </defs>

            {/* Meta - gray dashed line */}
            <Area
              dataKey="meta"
              type="monotone"
              fill="none"
              stroke="var(--tone-slate)"
              strokeWidth={2}
              strokeDasharray="8 4"
              dot={false}
              connectNulls
            />

            {/* Forecast - violeta tracejado */}
            <Area
              dataKey="forecast"
              type="monotone"
              fill="none"
              stroke="var(--tone-violet)"
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={false}
              connectNulls
            />

            {/* Pace - azul-céu tracejado */}
            <Area
              dataKey="pace"
              type="monotone"
              fill="none"
              stroke="var(--tone-sky)"
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={false}
              connectNulls
            />

            {/* Revenue - green solid with gradient fill */}
            <Area
              dataKey="revenue"
              type="monotone"
              fill="url(#fillRevenueLive)"
              fillOpacity={1}
              stroke="var(--tone-green)"
              strokeWidth={2.5}
              dot={false}
              connectNulls
            />

            <Legend
              verticalAlign="bottom"
              height={36}
              formatter={(value: string) => {
                const labels: Record<string, string> = {
                  revenue: "Faturamento",
                  meta: "Meta",
                  forecast: "Forecast",
                  pace: "Pace",
                };
                return labels[value] || value;
              }}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
