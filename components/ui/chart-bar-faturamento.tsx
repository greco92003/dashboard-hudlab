"use client";

import { useState, useEffect, useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OTEMonthlyTarget } from "@/types/ote";
import { DateRange } from "react-day-picker";
import { formatCurrency } from "@/lib/utils";

interface Deal {
  value: number;
  custom_field_value: string | null;
  closing_date: string | null;
  [key: string]: string | number | null | undefined;
}

interface ChartBarFaturamentoProps {
  deals: Deal[];
  prevDeals: Deal[];
  dateRange?: DateRange;
  period: number;
  useCustomPeriod: boolean;
}

const MONTH_NAMES = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

const chartConfig = {
  anoAnterior: { label: "Ano Anterior", color: "hsl(220 9% 60%)" },
  meta: { label: "Meta", color: "hsl(330 80% 60%)" },
  realizado: { label: "Realizado", color: "var(--chart-1)" },
} satisfies ChartConfig;

// Barra da meta: rosa tracejado (listras diagonais via SVG pattern)
function MetaBarShape(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  radius?: number | number[];
}) {
  const { x = 0, y = 0, width = 0, height = 0, radius = 4 } = props;
  if (!width || !height) return null;
  const r = Array.isArray(radius) ? radius[0] : radius;
  return (
    <g>
      <defs>
        <pattern
          id="meta-stripe"
          patternUnits="userSpaceOnUse"
          width="6"
          height="6"
          patternTransform="rotate(45)"
        >
          <rect width="3" height="6" fill="hsl(330 80% 60%)" />
          <rect x="3" width="3" height="6" fill="hsl(330 80% 90% / 0.35)" />
        </pattern>
      </defs>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="url(#meta-stripe)"
        rx={r}
        ry={r}
      />
    </g>
  );
}

export function ChartBarFaturamento({
  deals,
  prevDeals,
  dateRange,
  period,
  useCustomPeriod,
}: ChartBarFaturamentoProps) {
  const [targets, setTargets] = useState<OTEMonthlyTarget[]>([]);
  const [viewMode, setViewMode] = useState<"periodo" | "anual">("periodo");
  const [annualDeals, setAnnualDeals] = useState<Deal[]>([]);
  const [annualPrevDeals, setAnnualPrevDeals] = useState<Deal[]>([]);
  const [annualLoading, setAnnualLoading] = useState(false);

  useEffect(() => {
    const fetchTargets = async () => {
      try {
        const response = await fetch("/api/ote/targets");
        if (response.ok) {
          const data = await response.json();
          setTargets(data.targets || []);
        }
      } catch (error) {
        console.error("Error fetching OTE targets:", error);
      }
    };
    fetchTargets();
  }, []);

  // Derive the reference year for "Anual" view
  const annualYear = useMemo(() => {
    if (useCustomPeriod && dateRange?.from) {
      return dateRange.from.getFullYear();
    }
    return new Date().getFullYear();
  }, [useCustomPeriod, dateRange]);

  // Fetch full-year data when switching to "Anual" view
  useEffect(() => {
    if (viewMode !== "anual") return;

    const fetchAnnualData = async () => {
      setAnnualLoading(true);
      try {
        const startDate = `${annualYear}-01-01`;
        const endDate = `${annualYear}-12-31`;
        const prevStartDate = `${annualYear - 1}-01-01`;
        const prevEndDate = `${annualYear - 1}-12-31`;

        const [currentRes, prevRes] = await Promise.all([
          fetch(
            `/api/deals-cache?startDate=${startDate}&endDate=${endDate}&_t=${Date.now()}`,
          ),
          fetch(
            `/api/deals-cache?startDate=${prevStartDate}&endDate=${prevEndDate}&_t=${Date.now()}`,
          ),
        ]);

        if (currentRes.ok) {
          const data = await currentRes.json();
          setAnnualDeals(data.deals || []);
        }
        if (prevRes.ok) {
          const data = await prevRes.json();
          setAnnualPrevDeals(data.deals || []);
        }
      } catch (error) {
        console.error("Error fetching annual data:", error);
      } finally {
        setAnnualLoading(false);
      }
    };

    fetchAnnualData();
  }, [viewMode, annualYear]);

  const getDateBounds = (): { from: Date; to: Date } => {
    if (useCustomPeriod && dateRange?.from && dateRange?.to) {
      return { from: dateRange.from, to: dateRange.to };
    }
    const now = new Date();
    const to = new Date(now);
    to.setHours(23, 59, 59, 999);
    const from = new Date(now);
    let monthsToSubtract = 1;
    if (period === 60) monthsToSubtract = 2;
    else if (period === 90) monthsToSubtract = 3;
    from.setMonth(from.getMonth() - monthsToSubtract);
    from.setHours(0, 0, 0, 0);
    return { from, to };
  };

  const getDealMonthYear = (
    deal: Deal,
  ): { month: number; year: number } | null => {
    const dateStr =
      deal.custom_field_value?.split("T")[0] ||
      deal.closing_date?.split("T")[0];
    if (!dateStr) return null;
    const [year, month] = dateStr.split("-").map(Number);
    return { month, year };
  };

  // Build chart data for a given set of deals/prevDeals and a month list
  const buildChartData = (
    currentDeals: Deal[],
    previousDeals: Deal[],
    months: { month: number; year: number }[],
    isPrevShiftedByYear: boolean,
  ) => {
    const currentByMonth: Record<string, number> = {};
    currentDeals.forEach((deal) => {
      const my = getDealMonthYear(deal);
      if (!my) return;
      const key = `${my.year}-${my.month}`;
      currentByMonth[key] =
        (currentByMonth[key] || 0) + (deal.value || 0) / 100;
    });

    const prevByMonth: Record<string, number> = {};
    previousDeals.forEach((deal) => {
      const my = getDealMonthYear(deal);
      if (!my) return;
      // In period mode prevDeals are from year-1, map to current year for lookup
      const key = isPrevShiftedByYear
        ? `${my.year + 1}-${my.month}`
        : `${my.year}-${my.month}`;
      prevByMonth[key] = (prevByMonth[key] || 0) + (deal.value || 0) / 100;
    });

    const targetByMonth: Record<string, number> = {};
    targets.forEach((t) => {
      const key = `${t.year}-${t.month}`;
      targetByMonth[key] = t.target_amount;
    });

    const rangeTargets = months
      .map(({ month, year }) => targetByMonth[`${year}-${month}`])
      .filter((v): v is number => v !== undefined);
    const avgTarget =
      rangeTargets.length > 0
        ? rangeTargets.reduce((a, b) => a + b, 0) / rangeTargets.length
        : 0;

    return months.map(({ month, year }) => {
      const key = `${year}-${month}`;
      return {
        month: MONTH_NAMES[month - 1],
        anoAnterior: prevByMonth[key] || 0,
        meta: targetByMonth[key] ?? (rangeTargets.length > 0 ? avgTarget : 0),
        realizado: currentByMonth[key] || 0,
      };
    });
  };

  const periodoChartData = useMemo(() => {
    const { from, to } = getDateBounds();
    const months: { month: number; year: number }[] = [];
    const current = new Date(from.getFullYear(), from.getMonth(), 1);
    const endMonth = new Date(to.getFullYear(), to.getMonth(), 1);
    while (current <= endMonth) {
      months.push({
        month: current.getMonth() + 1,
        year: current.getFullYear(),
      });
      current.setMonth(current.getMonth() + 1);
    }
    return buildChartData(deals, prevDeals, months, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deals, prevDeals, targets, dateRange, period, useCustomPeriod]);

  const annualChartData = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      year: annualYear,
    }));
    // annualPrevDeals already contain year-1 data with correct year; use key as-is but map to annualYear for lookup
    return buildChartData(annualDeals, annualPrevDeals, months, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annualDeals, annualPrevDeals, targets, annualYear]);

  const chartData = viewMode === "anual" ? annualChartData : periodoChartData;

  return (
    <Card className="h-[400px] flex flex-col">
      <CardHeader className="py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle>Comparativo Mensal</CardTitle>
            <CardDescription>
              {viewMode === "anual"
                ? `Jan–Dez ${annualYear} · Ano anterior · Meta · Realizado`
                : "Ano anterior · Meta · Realizado"}
            </CardDescription>
          </div>
          <Tabs
            value={viewMode}
            onValueChange={(v) => setViewMode(v as "periodo" | "anual")}
          >
            <TabsList className="h-7">
              <TabsTrigger value="periodo" className="text-xs px-2 py-0.5">
                Período
              </TabsTrigger>
              <TabsTrigger value="anual" className="text-xs px-2 py-0.5">
                Anual
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 pt-0">
        {annualLoading && viewMode === "anual" ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-muted-foreground text-sm animate-pulse">
              Carregando dados anuais…
            </div>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-full w-full">
            <BarChart
              accessibilityLayer
              data={chartData}
              margin={{ left: 4, right: 4, top: 8, bottom: 8 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="month"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
              />
              <YAxis
                tickFormatter={(v) =>
                  v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                }
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={48}
              />
              <ChartTooltip
                cursor={false}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="border-border/50 bg-background rounded-lg border px-3 py-2 text-sm shadow-xl">
                      <p className="text-muted-foreground mb-1">
                        {payload[0]?.payload.month}
                      </p>
                      {payload.map((entry) => (
                        <p
                          key={entry.dataKey as string}
                          className="font-medium"
                          style={{ color: entry.color }}
                        >
                          {chartConfig[
                            entry.dataKey as keyof typeof chartConfig
                          ]?.label ?? entry.dataKey}
                          {": "}
                          {formatCurrency(entry.value as number, "BRL")}
                        </p>
                      ))}
                    </div>
                  );
                }}
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar
                dataKey="anoAnterior"
                fill="var(--color-anoAnterior)"
                radius={4}
              />
              <Bar
                dataKey="meta"
                fill="var(--color-meta)"
                radius={4}
                shape={<MetaBarShape />}
              />
              <Bar
                dataKey="realizado"
                fill="var(--color-realizado)"
                radius={4}
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
