"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  XAxis,
  YAxis,
} from "recharts";
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
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

interface Deal {
  custom_field_value: string | null;
  closing_date: string | null;
  created_date: string | null;
  [key: string]: string | number | null | undefined;
}

interface ChartBarCicloVendasProps {
  deals: Deal[];
  prevDeals: Deal[];
}

const BUCKETS = [
  { label: "0-7 dias", min: 0, max: 7 },
  { label: "8-15 dias", min: 8, max: 15 },
  { label: "16-30 dias", min: 16, max: 30 },
  { label: "31-60 dias", min: 31, max: 60 },
  { label: "60+ dias", min: 61, max: Infinity },
];

const chartConfig = {
  anoAtual: { label: "Ano Atual", color: "var(--chart-1)" },
  anoAnterior: { label: "Ano Anterior", color: "hsl(220 9% 60%)" },
  label: { color: "var(--background)" },
} satisfies ChartConfig;

function getDealDays(deal: Deal): number | null {
  const closingStr =
    deal.custom_field_value?.split("T")[0] || deal.closing_date?.split("T")[0];
  const createdStr = deal.created_date?.split("T")[0];
  if (!closingStr || !createdStr) return null;
  const closing = new Date(closingStr);
  const created = new Date(createdStr);
  const diff = (closing.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 ? Math.round(diff) : null;
}

function getBucketDistribution(deals: Deal[]): number[] {
  const valid = deals.map(getDealDays).filter((d): d is number => d !== null);

  const total = valid.length;
  if (total === 0) return BUCKETS.map(() => 0);

  return BUCKETS.map(({ min, max }) => {
    const count = valid.filter((d) => d >= min && d <= max).length;
    return Math.round((count / total) * 100);
  });
}

// Label sempre fora da barra, à direita
function BarPercentLabel(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  value?: number;
}) {
  const { x = 0, y = 0, width = 0, height = 0, value = 0 } = props;
  if (!value) return null;
  return (
    <text
      x={x + width + 6}
      y={y + height / 2}
      textAnchor="start"
      dominantBaseline="middle"
      fontSize={11}
      fill="currentColor"
    >
      {`${value}%`}
    </text>
  );
}

export function ChartBarCicloVendas({
  deals,
  prevDeals,
}: ChartBarCicloVendasProps) {
  const chartData = useMemo(() => {
    const currentDist = getBucketDistribution(deals);
    const prevDist = getBucketDistribution(prevDeals);

    return BUCKETS.map((bucket, i) => ({
      bucket: bucket.label,
      anoAnterior: prevDist[i],
      anoAtual: currentDist[i],
    }));
  }, [deals, prevDeals]);

  return (
    <Card className="h-[400px] flex flex-col">
      <CardHeader className="py-3">
        <CardTitle>Ciclo de Vendas</CardTitle>
        <CardDescription>Ano anterior · Ano atual</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 pt-0 overflow-visible">
        <ChartContainer
          config={chartConfig}
          className="h-full w-full overflow-visible"
        >
          <BarChart
            accessibilityLayer
            data={chartData}
            layout="vertical"
            margin={{ right: 48, left: 0, top: 4, bottom: 4 }}
            {...{ overflow: "visible" }}
          >
            <CartesianGrid horizontal={false} />
            <YAxis
              dataKey="bucket"
              type="category"
              tickLine={false}
              tickMargin={8}
              axisLine={false}
              width={72}
              tick={{ fontSize: 11 }}
            />
            <XAxis dataKey="anoAtual" type="number" domain={[0, 100]} hide />
            <ChartLegend content={<ChartLegendContent />} />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  indicator="line"
                  formatter={(value, name) => {
                    const cfg = chartConfig[
                      name as keyof typeof chartConfig
                    ] as { label?: string; color: string } | undefined;
                    return `${cfg?.label ?? name}: ${value}%`;
                  }}
                />
              }
            />
            <Bar
              dataKey="anoAtual"
              layout="vertical"
              fill="var(--color-anoAtual)"
              radius={4}
              isAnimationActive={false}
            >
              <LabelList dataKey="anoAtual" content={<BarPercentLabel />} />
            </Bar>
            <Bar
              dataKey="anoAnterior"
              layout="vertical"
              fill="var(--color-anoAnterior)"
              radius={4}
              isAnimationActive={false}
            >
              <LabelList dataKey="anoAnterior" content={<BarPercentLabel />} />
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
