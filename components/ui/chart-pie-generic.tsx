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
import { HUD_BREAKDOWN_COLORS } from "@/components/ui/hud-breakdown-colors";


interface Deal {
  value: number;
  [key: string]: string | number | null | undefined;
}

interface ChartPieGenericProps {
  deals: Deal[];
  prevDeals?: Deal[];
  fieldKey?: string;
  keyExtractor?: (deal: Deal) => string;
  title: string;
  description: string;
  countLabel?: string;
  emptyLabel?: string;
  showTabs?: boolean;
}

// Helper function to process deals data
function processDealsData(
  deals: Deal[],
  fieldKey: string | undefined,
  emptyLabel: string,
  keyExtractor?: (deal: Deal) => string,
) {
  // Group deals by the specified field key or custom extractor
  const groupedData = deals.reduce(
    (acc, deal) => {
      let label: string;
      if (keyExtractor) {
        label = keyExtractor(deal) || emptyLabel;
      } else {
        const rawValue = fieldKey ? deal[fieldKey] : null;
        label =
          rawValue && String(rawValue).trim() !== ""
            ? String(rawValue).trim()
            : emptyLabel;
      }
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
      fill: HUD_BREAKDOWN_COLORS[index % HUD_BREAKDOWN_COLORS.length],
    }));

  // Create chart config for all items
  const chartConfig = sorted.reduce(
    (config, { label }, index) => {
      const key = `item_${index}`;
      config[key] = {
        label,
        color: HUD_BREAKDOWN_COLORS[index % HUD_BREAKDOWN_COLORS.length],
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
  keyExtractor,
  title,
  countLabel = "categorias",
  emptyLabel = "Não informado",
  showTabs = false,
}: ChartPieGenericProps) {
  const [activeTab, setActiveTab] = useState<"current" | "previous">("current");

  const currentYearData = processDealsData(
    deals,
    fieldKey,
    emptyLabel,
    keyExtractor,
  );
  const prevYearData = prevDeals
    ? processDealsData(prevDeals, fieldKey, emptyLabel, keyExtractor)
    : null;

  const hasTabs = showTabs && !!prevYearData;
  const activeData =
    hasTabs && activeTab === "previous" ? prevYearData! : currentYearData;

  return (
    <Widget className="h-full gap-0">
      {/* Título sempre em uma linha: se quebrasse em duas, a divisória do
          cabeçalho cairia numa altura diferente da dos cards vizinhos. */}
      <WidgetHeader className="border-b">
        <WidgetTitle className="min-w-0 truncate text-lg" title={title}>
          {title}
        </WidgetTitle>
        {/* Contador em escala menor: é informação secundária e, no text-lg
            original, não sobrava largura para o título ao lado. */}
        <WidgetTitle className="text-muted-foreground shrink-0 whitespace-nowrap text-sm font-medium">
          {activeData.chartData.length} {countLabel}
        </WidgetTitle>
      </WidgetHeader>

      {/* Altura fixa: o gráfico não pode absorver a sobra do card, senão a
          divisória de baixo sobe e desce conforme o tamanho da legenda. */}
      <WidgetContent className="flex-none flex-col justify-center py-2">
        <ChartContainer config={activeData.chartConfig} className="h-44 w-full">
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
            <Pie
              data={activeData.chartData}
              dataKey="value"
              nameKey="label"
              innerRadius="54%"
              outerRadius="92%"
            />
          </PieChart>
        </ChartContainer>
      </WidgetContent>

      <WidgetFooter className="flex-1 gap-3 border-t">
        {/* Legend — ocupa a sobra e centraliza nela, para que as abas fiquem
            coladas na base e alinhadas entre os cards. */}
        <div className="flex flex-1 flex-wrap content-center items-center justify-center gap-x-4 gap-y-2">
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
            {/* O TabsTrigger é nowrap por padrão: em card estreito o rótulo
                escapava para fora do botão. O span interno é que apara. */}
            <TabsList className="w-full">
              <TabsTrigger value="current" className="min-w-0 flex-1 text-xs">
                <span className="truncate">Ano Atual</span>
              </TabsTrigger>
              <TabsTrigger value="previous" className="min-w-0 flex-1 text-xs">
                <span className="truncate">Ano Anterior</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </WidgetFooter>
    </Widget>
  );
}
