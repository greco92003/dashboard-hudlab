"use client";

import { TrendingUp, TrendingDown } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, Legend } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/chart";
import { formatCurrency } from "@/lib/utils";

interface ChartData {
  date: string;
  revenue: number;
  prevRevenue?: number;
}

interface ChartProps {
  data: ChartData[];
  title: string;
  description: string;
  period: number;
  prevYearData?: ChartData[];
}

export function ChartAreaGradient({
  data,
  title,
  description,
  period,
  prevYearData,
}: ChartProps) {
  // Merge previous year data into current data by index position
  const mergedData =
    prevYearData && prevYearData.length > 0
      ? data.map((item, idx) => ({
          ...item,
          prevRevenue: prevYearData[idx]?.revenue ?? 0,
        }))
      : data;
  // Format date for display - Parse as local date to avoid timezone issues
  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split("-").map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    });
  };

  // Com o ano anterior, a variação é contra ele -- o mesmo "Anterior" do card
  // de faturamento. Comparar as metades do período, como antes, dava "queda"
  // num mês que cresceu 75% sobre o ano anterior, só porque a venda grande
  // caiu na 1ª metade. Sem ano anterior (dashboard de parceiros), segue a
  // comparação das metades, dita com todas as letras.
  const calculateTrend = () => {
    const neutral = { value: "0", trending: "neutral", comparacao: "" };
    const total = (items: ChartData[]) =>
      items.reduce((sum, item) => sum + item.revenue, 0);

    let base: number;
    let atual: number;
    let comparacao: string;
    if (prevYearData && prevYearData.length > 0) {
      base = total(prevYearData);
      atual = total(data);
      comparacao = "sobre o mesmo período do ano anterior";
    } else {
      if (data.length < 2) return neutral;
      const halfPoint = Math.floor(data.length / 2);
      base = total(data.slice(0, halfPoint));
      atual = total(data.slice(halfPoint));
      comparacao = "na 2ª metade do período";
    }

    if (base === 0) return neutral;

    const percentChange = ((atual - base) / base) * 100;
    return {
      value: Math.abs(percentChange).toLocaleString("pt-BR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
      trending: percentChange >= 0 ? "up" : "down",
      comparacao,
    };
  };

  const trend = calculateTrend();

  // Configure chart
  const chartConfig = {
    revenue: {
      label: "Ano Atual",
      color: "var(--chart-1)",
    },
    prevRevenue: {
      label: "Ano Anterior",
      color: "#9ca3af",
    },
  } satisfies ChartConfig;

  // Get date range for footer - Parse dates locally to avoid timezone issues
  const getDateRange = () => {
    if (data.length === 0) return `Últimos ${period} dias`;

    const dates = data.map((item) => {
      const [year, month, day] = item.date.split("-").map(Number);
      return new Date(year, month - 1, day); // month is 0-indexed
    });
    const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));

    return `${minDate.toLocaleDateString(
      "pt-BR",
    )} - ${maxDate.toLocaleDateString("pt-BR")}`;
  };

  return (
    <Card className="h-[400px] flex flex-col">
      <CardHeader className="py-3">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 pt-0">
        <ChartContainer config={chartConfig} className="h-full w-full">
          <AreaChart
            accessibilityLayer
            data={mergedData}
            margin={{
              left: 12,
              right: 12,
              top: 12,
              bottom: 12,
            }}
            height={200}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={formatDate}
            />
            <YAxis
              tickFormatter={(value) => `R$${value}`}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <ChartTooltip
              cursor={false}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="border-border/50 bg-background rounded-lg border px-3 py-2 text-sm shadow-xl">
                      <p className="text-muted-foreground">
                        {formatDate(payload[0].payload.date)}
                      </p>
                      {payload.map((entry) => (
                        <p
                          key={entry.dataKey as string}
                          className="font-medium"
                          style={{ color: entry.color }}
                        >
                          {entry.dataKey === "prevRevenue"
                            ? "Ano Anterior: "
                            : "Ano Atual: "}
                          {formatCurrency(entry.value as number)}
                        </p>
                      ))}
                    </div>
                  );
                }
                return null;
              }}
            />
            {prevYearData && prevYearData.length > 0 && (
              <Legend
                verticalAlign="top"
                formatter={(value) =>
                  value === "revenue" ? "Ano Atual" : "Ano Anterior"
                }
              />
            )}
            <defs>
              <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-revenue)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-revenue)"
                  stopOpacity={0.1}
                />
              </linearGradient>
            </defs>
            {prevYearData && prevYearData.length > 0 && (
              <Area
                dataKey="prevRevenue"
                type="monotone"
                fill="none"
                stroke="#9ca3af"
                strokeWidth={1.5}
                strokeDasharray="5 5"
                strokeOpacity={0.6}
                dot={false}
              />
            )}
            <Area
              dataKey="revenue"
              type="monotone"
              fill="url(#fillRevenue)"
              fillOpacity={0.4}
              stroke="var(--color-revenue)"
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
      <CardFooter>
        <div className="flex w-full items-start gap-2 text-sm">
          <div className="grid gap-2">
            {trend.trending !== "neutral" && (
              <div className="flex items-center gap-2 leading-none font-medium">
                {trend.trending === "up" ? (
                  <>
                    Crescimento de {trend.value}% {trend.comparacao}{" "}
                    <TrendingUp className="h-4 w-4 text-green-500" />
                  </>
                ) : (
                  <>
                    Queda de {trend.value}% {trend.comparacao}{" "}
                    <TrendingDown className="h-4 w-4 text-red-500" />
                  </>
                )}
              </div>
            )}
            <div className="text-muted-foreground flex items-center gap-2 leading-none">
              {getDateRange()}
            </div>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}
