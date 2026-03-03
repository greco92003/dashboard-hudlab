"use client";

import { useState } from "react";
import { Pie, PieChart } from "recharts";
import {
  Widget,
  WidgetHeader,
  WidgetContent,
  WidgetTitle,
  WidgetFooter,
} from "@/components/ui/widget";
import { Label } from "@/components/ui/label";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  prevDeals?: Deal[];
  fieldKey: string;
  title: string;
  description: string;
  countLabel?: string;
  emptyLabel?: string;
  showTabs?: boolean;
}

// Helper function to process deals data
function processDealsData(deals: Deal[], fieldKey: string, emptyLabel: string) {
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

  // Create full chart data (all items for the pie chart, excluding zero-value entries)
  const fullChartData = sorted
    .filter(({ value }) => value > 0)
    .map(({ label, value }, index) => ({
      label,
      value,
      fill: CHART_COLORS[index % CHART_COLORS.length],
    }));

  // Create chart config for all items
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

  // Get top 5 for the legend/table only
  const legendData = fullChartData.slice(0, 5);

  const totalValue = fullChartData.reduce((sum, item) => sum + item.value, 0);
  const topItem = fullChartData[0];

  return {
    chartConfig,
    chartData: fullChartData,
    legendData,
    totalValue,
    topItem,
  };
}

export function ChartPieGeneric({
  deals,
  prevDeals,
  fieldKey,
  title,
  countLabel = "categorias",
  emptyLabel = "Não informado",
  showTabs = false,
}: ChartPieGenericProps) {
  const [activeTab, setActiveTab] = useState<"current" | "previous">("current");

  const currentYearData = processDealsData(deals, fieldKey, emptyLabel);
  const prevYearData = prevDeals
    ? processDealsData(prevDeals, fieldKey, emptyLabel)
    : null;

  const hasTabs = showTabs && !!prevYearData;
  const activeData =
    hasTabs && activeTab === "previous" ? prevYearData! : currentYearData;

  return (
    <Widget className="gap-0">
      <WidgetHeader className="border-b">
        <WidgetTitle className="text-lg">{title}</WidgetTitle>
        <WidgetTitle className="text-lg">
          {activeData.chartData.length} {countLabel}
        </WidgetTitle>
      </WidgetHeader>

      <WidgetContent className="flex-col justify-start py-2">
        <ChartContainer
          config={activeData.chartConfig}
          className="size-full max-h-44"
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  formatter={(value, name) => (
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium break-words max-w-[180px]">
                        {name}
                      </span>
                      <span className="text-muted-foreground">
                        {formatCurrency(Number(value), "BRL")}
                      </span>
                    </div>
                  )}
                  hideLabel
                />
              }
            />
            <Pie data={activeData.chartData} dataKey="value" nameKey="label" />
          </PieChart>
        </ChartContainer>
      </WidgetContent>

      <WidgetFooter className="gap-3 border-t">
        {/* Legend */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          {activeData.legendData.map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <div
                className="size-2.5 rounded-full shrink-0"
                style={{ backgroundColor: item.fill }}
              />
              <Label
                className="text-muted-foreground text-xs cursor-default"
                title={item.label}
              >
                {item.label.length > 7
                  ? item.label.slice(0, 7) + "…"
                  : item.label}
              </Label>
            </div>
          ))}
        </div>

        {/* Tabs no footer */}
        {hasTabs && (
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as "current" | "previous")}
            className="w-full"
          >
            <TabsList className="w-full">
              <TabsTrigger value="current" className="flex-1 text-xs">
                Ano Atual
              </TabsTrigger>
              <TabsTrigger value="previous" className="flex-1 text-xs">
                Ano Anterior
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </WidgetFooter>
    </Widget>
  );
}
