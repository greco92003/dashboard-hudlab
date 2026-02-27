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
import { RefreshCw, TrendingUp, Target, Zap, BarChart3 } from "lucide-react";

function LiveDot() {
  return (
    <span className="relative flex h-3 w-3">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
      <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
    </span>
  );
}
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/utils/supabase/client";

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
  totalDaysInMonth: number;
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
  revenue: { label: "Faturamento", color: "#22c55e" },
  meta: { label: "Meta", color: "#9ca3af" },
  forecast: { label: "Forecast", color: "#a855f7" },
  pace: { label: "Pace", color: "#f97316" },
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
  const { time, dateStr } = useUTC3Clock();

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/live-dashboard");
      const json = await res.json();
      if (json.success) setData(json);
    } catch (err) {
      console.error("Error fetching live dashboard:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + Supabase Realtime subscription
  useEffect(() => {
    fetchData();

    // Subscribe to realtime changes on deals_live
    const supabase = createClient();
    const channel = supabase
      .channel("deals_live_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deals_live" },
        () => {
          // Re-fetch aggregated data when any deal changes
          fetchData();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  const formatDay = (dateStr: string) => {
    const day = parseInt(dateStr.split("-")[2]);
    return day.toString();
  };

  const currentPace = data
    ? data.todayDay > 0
      ? (data.totalRevenue / data.todayDay) * data.totalDaysInMonth
      : 0
    : 0;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LiveDot />
          <h1 className="text-xl sm:text-2xl font-bold">Live Dashboard</h1>
          {loading && (
            <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
        <div className="text-right">
          <div className="text-2xl sm:text-3xl font-mono font-bold tabular-nums">
            {time}
          </div>
          <div className="text-xs sm:text-sm text-muted-foreground">
            {dateStr}
          </div>
          {data && (
            <div className="text-sm font-medium text-muted-foreground">
              {MONTH_NAMES[data.month - 1]} {data.year}
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICard
            icon={<TrendingUp className="h-4 w-4 text-green-500" />}
            label="Faturamento"
            value={formatCurrency(data.totalRevenue)}
            color="green"
          />
          <KPICard
            icon={<Target className="h-4 w-4 text-gray-500" />}
            label="Meta"
            value={formatCurrency(data.monthlyTarget)}
            color="gray"
          />
          <KPICard
            icon={<BarChart3 className="h-4 w-4 text-orange-500" />}
            label="Pace"
            value={formatCurrency(currentPace)}
            color="orange"
          />
          <KPICard
            icon={<Zap className="h-4 w-4 text-purple-500" />}
            label="Forecast"
            value={formatCurrency(data.totalForecast)}
            color="purple"
          />
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

function KPICard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  const borderColors: Record<string, string> = {
    green: "border-l-green-500",
    gray: "border-l-gray-400",
    orange: "border-l-orange-500",
    purple: "border-l-purple-500",
  };

  return (
    <Card className={`border-l-4 ${borderColors[color] || ""}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <span className="text-xs sm:text-sm text-muted-foreground font-medium">
            {label}
          </span>
        </div>
        <div className="text-lg sm:text-xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function LiveChart({
  data,
  formatDay,
}: {
  data: DashboardData;
  formatDay: (d: string) => string;
}) {
  return (
    <Card className="flex-1">
      <CardHeader className="py-3">
        <CardTitle className="text-base sm:text-lg">
          Performance do Mês — {MONTH_NAMES[data.month - 1]} {data.year}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 pt-0">
        <ChartContainer config={chartConfig} className="h-[420px] w-full">
          <AreaChart
            data={data.chartData}
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
            />
            <ChartTooltip
              cursor={false}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const d = payload[0]?.payload;
                  return (
                    <div className="border-border/50 bg-background rounded-lg border px-3 py-2 text-sm shadow-xl space-y-1">
                      <p className="font-medium">Dia {d.day}</p>
                      {d.revenue !== null && (
                        <p className="text-green-500">
                          Faturamento: {formatCurrency(d.revenue)}
                        </p>
                      )}
                      <p className="text-gray-500">
                        Meta: {formatCurrency(d.meta)}
                      </p>
                      {d.forecast !== null && (
                        <p className="text-purple-500">
                          Forecast: {formatCurrency(d.forecast)}
                        </p>
                      )}
                      {d.pace !== null && (
                        <p className="text-orange-500">
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
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0.05} />
              </linearGradient>
            </defs>

            {/* Meta - gray dashed line */}
            <Area
              dataKey="meta"
              type="monotone"
              fill="none"
              stroke="#9ca3af"
              strokeWidth={2}
              strokeDasharray="8 4"
              dot={false}
              connectNulls
            />

            {/* Forecast - purple dashed */}
            <Area
              dataKey="forecast"
              type="monotone"
              fill="none"
              stroke="#a855f7"
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={false}
              connectNulls
            />

            {/* Pace - orange dashed */}
            <Area
              dataKey="pace"
              type="monotone"
              fill="none"
              stroke="#f97316"
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
              stroke="#22c55e"
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
