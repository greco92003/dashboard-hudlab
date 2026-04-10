"use client";

import {
  Line,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import type { FinancialTimelinePoint } from "@/lib/tiny/types";

const chartConfig = {
  payable: {
    label: "A pagar",
    color: "var(--chart-1)",
  },
  receivable: {
    label: "A receber",
    color: "var(--chart-2)",
  },
  cashBalance: {
    label: "Saldo em caixa",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig;

interface FinancialLineChartProps {
  data?: FinancialTimelinePoint[];
  loading?: boolean;
}

function fmtBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function FinancialLineChart({ data, loading }: FinancialLineChartProps) {
  if (loading || !data) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Nenhum dado disponível para o período.
      </div>
    );
  }

  // Show dots when there are very few points so they remain visible
  const showDots = data.length <= 3;

  return (
    <ChartContainer config={chartConfig} className="min-h-64 w-full">
      <LineChart
        data={data}
        margin={{ top: 8, right: 16, bottom: 8, left: 16 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="period" tick={{ fontSize: 12 }} />
        <YAxis
          tickFormatter={(v) => fmtBRL(v as number)}
          tick={{ fontSize: 11 }}
          width={90}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => fmtBRL(value as number)}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Line
          type="monotone"
          dataKey="payable"
          stroke="var(--chart-1)"
          strokeWidth={2}
          dot={showDots}
          activeDot={{ r: 5 }}
        />
        <Line
          type="monotone"
          dataKey="receivable"
          stroke="var(--chart-2)"
          strokeWidth={2}
          dot={showDots}
          activeDot={{ r: 5 }}
        />
        <Line
          type="monotone"
          dataKey="cashBalance"
          stroke="var(--chart-3)"
          strokeWidth={2}
          dot={showDots}
          activeDot={{ r: 5 }}
          strokeDasharray="5 3"
        />
      </LineChart>
    </ChartContainer>
  );
}
