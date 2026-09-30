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
import { ultimosDias } from "@/lib/periodo";
import { limitesDosFechamentos, mesDeFechamento } from "@/lib/live-dashboard-period";

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

const isWonDeal = (d: Deal & { status?: string | null }) => {
  const s = d.status?.toLowerCase();
  return s === "won" || s === "1";
};

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
  const [viewMode, setViewMode] = useState<"mensal" | "anual">("mensal");
  const [mensalDeals, setMensalDeals] = useState<Deal[]>([]);
  const [mensalPrevDeals, setMensalPrevDeals] = useState<Deal[]>([]);
  const [mensalLoading, setMensalLoading] = useState(false);
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

  // Compute full-month bounds based on the selected period/dateRange
  const mensalBounds = useMemo(() => {
    let from: Date, to: Date;
    if (useCustomPeriod && dateRange?.from && dateRange?.to) {
      from = dateRange.from;
      to = dateRange.to;
    } else {
      // Mesma definição de "últimos N dias" das demais telas (lib/periodo.ts).
      const { inicio, fim } = ultimosDias(period);
      from = new Date(`${inicio}T00:00:00`);
      to = new Date(`${fim}T23:59:59.999`);
    }
    // Meses do período no fechamento mensal (dia 02 ao dia 01 do mês
    // seguinte, lib/live-dashboard-period.ts) -- mesma regra do Live Dashboard.
    const primeiro = { month: from.getMonth() + 1, year: from.getFullYear() };
    const ultimo = { month: to.getMonth() + 1, year: to.getFullYear() };
    const atual = limitesDosFechamentos(primeiro, ultimo);
    const anterior = limitesDosFechamentos(
      { ...primeiro, year: primeiro.year - 1 },
      { ...ultimo, year: ultimo.year - 1 },
    );
    return {
      startDate: atual.inicio,
      endDate: atual.fim,
      prevStartDate: anterior.inicio,
      prevEndDate: anterior.fim,
      primeiro,
      ultimo,
    };
  }, [useCustomPeriod, dateRange, period]);

  // Fetch full-month data for "Mensal" view (always kept fresh)
  useEffect(() => {
    const fetchMensalData = async () => {
      setMensalLoading(true);
      try {
        const { startDate, endDate, prevStartDate, prevEndDate } = mensalBounds;
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
          setMensalDeals((data.deals || []).filter(isWonDeal));
        }
        if (prevRes.ok) {
          const data = await prevRes.json();
          setMensalPrevDeals((data.deals || []).filter(isWonDeal));
        }
      } catch (error) {
        console.error("Error fetching mensal data:", error);
      } finally {
        setMensalLoading(false);
      }
    };
    fetchMensalData();
  }, [mensalBounds]);

  // Fetch full-year data when switching to "Anual" view
  useEffect(() => {
    if (viewMode !== "anual") return;

    const fetchAnnualData = async () => {
      setAnnualLoading(true);
      try {
        // Fechamentos de janeiro a dezembro: 02/01 a 01/01 do ano seguinte.
        const { inicio: startDate, fim: endDate } = limitesDosFechamentos(
          { month: 1, year: annualYear },
          { month: 12, year: annualYear },
        );
        const { inicio: prevStartDate, fim: prevEndDate } = limitesDosFechamentos(
          { month: 1, year: annualYear - 1 },
          { month: 12, year: annualYear - 1 },
        );

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
          setAnnualDeals((data.deals || []).filter(isWonDeal));
        }
        if (prevRes.ok) {
          const data = await prevRes.json();
          setAnnualPrevDeals((data.deals || []).filter(isWonDeal));
        }
      } catch (error) {
        console.error("Error fetching annual data:", error);
      } finally {
        setAnnualLoading(false);
      }
    };

    fetchAnnualData();
  }, [viewMode, annualYear]);

  const getDealMonthYear = (
    deal: Deal,
  ): { month: number; year: number } | null => {
    // Data real da venda (closing_date, a mesma do /dashboard e do Live
    // Dashboard) -- o campo manual "Data de Fechamento" pode estar
    // desatualizado. O mês é o do fechamento 02→01.
    const dateStr = deal.closing_date?.split("T")[0];
    if (!dateStr) return null;
    return mesDeFechamento(dateStr);
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

  const mensalChartData = useMemo(() => {
    const { primeiro, ultimo } = mensalBounds;
    const months: { month: number; year: number }[] = [];
    const current = new Date(primeiro.year, primeiro.month - 1, 1);
    const endMonth = new Date(ultimo.year, ultimo.month - 1, 1);
    while (current <= endMonth) {
      months.push({
        month: current.getMonth() + 1,
        year: current.getFullYear(),
      });
      current.setMonth(current.getMonth() + 1);
    }
    return buildChartData(mensalDeals, mensalPrevDeals, months, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mensalDeals, mensalPrevDeals, targets, mensalBounds]);

  const annualChartData = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      year: annualYear,
    }));
    // annualPrevDeals already contain year-1 data with correct year; use key as-is but map to annualYear for lookup
    return buildChartData(annualDeals, annualPrevDeals, months, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annualDeals, annualPrevDeals, targets, annualYear]);

  const chartData = viewMode === "anual" ? annualChartData : mensalChartData;

  return (
    <Card className="h-[400px] flex flex-col">
      <CardHeader className="py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle>Comparativo Mensal</CardTitle>
            <CardDescription>
              {viewMode === "anual"
                ? `Jan–Dez ${annualYear} · Ano anterior · Meta · Realizado · mês = dia 02 ao dia 01`
                : "Ano anterior · Meta · Realizado · mês = dia 02 ao dia 01"}
            </CardDescription>
          </div>
          <Tabs
            value={viewMode}
            onValueChange={(v) => setViewMode(v as "mensal" | "anual")}
          >
            <TabsList className="h-7">
              <TabsTrigger value="mensal" className="text-xs px-2 py-0.5">
                Mensal
              </TabsTrigger>
              <TabsTrigger value="anual" className="text-xs px-2 py-0.5">
                Anual
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 pt-0">
        {(mensalLoading && viewMode === "mensal") ||
        (annualLoading && viewMode === "anual") ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-muted-foreground text-sm animate-pulse">
              {viewMode === "anual"
                ? "Carregando dados anuais…"
                : "Carregando dados mensais…"}
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
