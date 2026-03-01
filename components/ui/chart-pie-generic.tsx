"use client";

import { TrendingUp } from "lucide-react";
import { Pie, PieChart } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatCurrency } from "@/lib/utils";

const CHART_COLORS = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#ca8a04",
  "#9333ea",
  "#ea580c",
  "#0891b2",
  "#be123c",
  "#65a30d",
  "#7c2d12",
  "#1e40af",
  "#991b1b",
  "#166534",
  "#a16207",
  "#7c3aed",
  "#c2410c",
  "#0e7490",
  "#be185d",
  "#4d7c0f",
  "#92400e",
];

interface Deal {
  value: number;
  [key: string]: string | number | null | undefined;
}

interface ChartPieGenericProps {
  deals: Deal[];
  fieldKey: string;
  title: string;
  description: string;
  emptyLabel?: string;
}

// Helper function to truncate text
function truncateText(text: string, maxLength: number = 15): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

export function ChartPieGeneric({
  deals,
  fieldKey,
  title,
  description,
  emptyLabel = "Não informado",
}: ChartPieGenericProps) {
  // Group deals by the specified field key
  const groupedData = deals.reduce(
    (acc, deal) => {
      const rawValue = deal[fieldKey];
      const label =
        rawValue && String(rawValue).trim() !== ""
          ? String(rawValue).trim()
          : emptyLabel;
      const value = (deal.value || 0) / 100;
      if (!acc[label]) acc[label] = 0;
      acc[label] += value;
      return acc;
    },
    {} as Record<string, number>,
  );

  // Round and sort descending
  const sorted = Object.entries(groupedData)
    .map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value);

  const chartConfig = sorted.reduce(
    (config, { label }, index) => {
      const key = `item_${index}`;
      config[key] = {
        label,
        color: CHART_COLORS[index % CHART_COLORS.length],
      };
      return config;
    },
    { value: { label: "Valor (R$)" } } as ChartConfig,
  );

  const chartData = sorted.map(({ label, value }, index) => ({
    label,
    value,
    fill: CHART_COLORS[index % CHART_COLORS.length],
  }));

  const totalValue = chartData.reduce((sum, item) => sum + item.value, 0);
  const topItem = chartData[0];

  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-0">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pt-0 px-2 sm:px-6 pb-2">
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 items-start lg:items-center">
          <div className="w-full lg:w-2/3 flex flex-col justify-center order-1 lg:order-2">
            <ChartContainer
              config={chartConfig}
              className="[&_.recharts-pie-label-text]:fill-foreground w-full h-[250px] sm:h-[300px] lg:h-[400px] overflow-visible"
            >
              <PieChart>
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0];
                      return (
                        <div className="border-border/50 bg-background rounded-lg border px-3 py-2 text-sm shadow-xl">
                          <p className="font-medium mb-1 break-words max-w-xs">
                            {data.name}
                          </p>
                          <p className="text-muted-foreground">
                            {formatCurrency(Number(data.value), "BRL")}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Pie
                  data={chartData}
                  dataKey="value"
                  label={({ value }) => formatCurrency(Number(value), "BRL")}
                  nameKey="label"
                  outerRadius="80%"
                  innerRadius={0}
                  cx="50%"
                  cy="50%"
                />
              </PieChart>
            </ChartContainer>

            {/* Informações do gráfico */}
            <div className="flex flex-col gap-2 text-xs sm:text-sm mt-2 text-center">
              {topItem && (
                <div className="flex items-center justify-center gap-2 leading-none font-medium">
                  {topItem.label} lidera com{" "}
                  {formatCurrency(topItem.value, "BRL")}{" "}
                  <TrendingUp className="h-4 w-4" />
                </div>
              )}
              <div className="text-muted-foreground leading-none">
                Total de {formatCurrency(totalValue, "BRL")} em{" "}
                {chartData.length} categorias
              </div>
            </div>
          </div>
          <div className="w-full lg:w-1/3 order-2 lg:order-1">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs sm:text-sm">
                      Categoria
                    </TableHead>
                    <TableHead className="text-right text-xs sm:text-sm">
                      Valor
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TooltipProvider delayDuration={200}>
                    {chartData.map((item) => {
                      const isLongText = item.label.length > 15;
                      const truncatedLabel = truncateText(item.label, 15);

                      return (
                        <TableRow key={item.label}>
                          <TableCell className="flex items-center gap-2 text-xs sm:text-sm">
                            <div
                              className="w-2 h-2 sm:w-3 sm:h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: item.fill }}
                            />
                            {isLongText ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="truncate cursor-pointer">
                                    {truncatedLabel}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent
                                  side="top"
                                  className="max-w-xs break-words"
                                >
                                  <p>{item.label}</p>
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="truncate">{item.label}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-medium text-xs sm:text-sm whitespace-nowrap">
                            {formatCurrency(item.value, "BRL")}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TooltipProvider>
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
