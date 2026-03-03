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

// Mapeamento dos estados brasileiros
const ESTADOS_BRASILEIROS = {
  // Siglas
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
  DF: "Distrito Federal",

  // Nomes completos (case insensitive)
  ACRE: "Acre",
  ALAGOAS: "Alagoas",
  AMAPÁ: "Amapá",
  AMAPA: "Amapá",
  AMAZONAS: "Amazonas",
  BAHIA: "Bahia",
  CEARÁ: "Ceará",
  CEARA: "Ceará",
  "ESPÍRITO SANTO": "Espírito Santo",
  "ESPIRITO SANTO": "Espírito Santo",
  GOIÁS: "Goiás",
  GOIAS: "Goiás",
  MARANHÃO: "Maranhão",
  MARANHAO: "Maranhão",
  "MATO GROSSO": "Mato Grosso",
  "MATO GROSSO DO SUL": "Mato Grosso do Sul",
  "MINAS GERAIS": "Minas Gerais",
  PARÁ: "Pará",
  PARA: "Pará",
  PARAÍBA: "Paraíba",
  PARAIBA: "Paraíba",
  PARANÁ: "Paraná",
  PARANA: "Paraná",
  PERNAMBUCO: "Pernambuco",
  PIAUÍ: "Piauí",
  PIAUI: "Piauí",
  "RIO DE JANEIRO": "Rio de Janeiro",
  "RIO GRANDE DO NORTE": "Rio Grande do Norte",
  "RIO GRANDE DO SUL": "Rio Grande do Sul",
  RONDÔNIA: "Rondônia",
  RONDONIA: "Rondônia",
  RORAIMA: "Roraima",
  "SANTA CATARINA": "Santa Catarina",
  "SÃO PAULO": "São Paulo",
  "SAO PAULO": "São Paulo",
  SERGIPE: "Sergipe",
  TOCANTINS: "Tocantins",
  "DISTRITO FEDERAL": "Distrito Federal",
};

// Mapeamento reverso: nome completo -> sigla
const ESTADO_TO_SIGLA: Record<string, string> = {
  Acre: "AC",
  Alagoas: "AL",
  Amapá: "AP",
  Amazonas: "AM",
  Bahia: "BA",
  Ceará: "CE",
  "Espírito Santo": "ES",
  Goiás: "GO",
  Maranhão: "MA",
  "Mato Grosso": "MT",
  "Mato Grosso do Sul": "MS",
  "Minas Gerais": "MG",
  Pará: "PA",
  Paraíba: "PB",
  Paraná: "PR",
  Pernambuco: "PE",
  Piauí: "PI",
  "Rio de Janeiro": "RJ",
  "Rio Grande do Norte": "RN",
  "Rio Grande do Sul": "RS",
  Rondônia: "RO",
  Roraima: "RR",
  "Santa Catarina": "SC",
  "São Paulo": "SP",
  Sergipe: "SE",
  Tocantins: "TO",
  "Distrito Federal": "DF",
  Outros: "OUT",
};

// Função para obter a sigla do estado
function getEstadoSigla(estadoNome: string): string {
  return ESTADO_TO_SIGLA[estadoNome] || "OUT";
}

// Função para normalizar o nome do estado
function normalizeEstado(estado: string | null): string {
  if (!estado) return "Outros";

  const estadoUpper = estado.trim().toUpperCase();
  return (
    ESTADOS_BRASILEIROS[estadoUpper as keyof typeof ESTADOS_BRASILEIROS] ||
    "Outros"
  );
}

// Cores para os estados (usando cores diretas que funcionam com Recharts)
const CHART_COLORS = [
  "#2563eb", // Azul
  "#dc2626", // Vermelho
  "#16a34a", // Verde
  "#ca8a04", // Amarelo
  "#9333ea", // Roxo
  "#ea580c", // Laranja
  "#0891b2", // Ciano
  "#be123c", // Rosa
  "#65a30d", // Lima
  "#7c2d12", // Marrom
  "#1e40af", // Azul escuro
  "#991b1b", // Vermelho escuro
  "#166534", // Verde escuro
  "#a16207", // Amarelo escuro
  "#7c3aed", // Roxo claro
  "#c2410c", // Laranja escuro
  "#0e7490", // Ciano escuro
  "#be185d", // Rosa escuro
  "#4d7c0f", // Lima escuro
  "#92400e", // Marrom claro
  "#3730a3", // Índigo
  "#7f1d1d", // Vermelho sangue
  "#14532d", // Verde floresta
  "#92400e", // Âmbar
  "#581c87", // Violeta
  "#9a3412", // Laranja queimado
  "#155e75", // Azul petróleo
  "#831843", // Rosa vinho
];

interface Deal {
  deal_id: string;
  title: string;
  value: number;
  currency: string;
  status: string | null;
  stage_id: string | null;
  closing_date: string | null;
  created_date: string | null;
  custom_field_value: string | null;
  custom_field_id: string | null;
  estado: string | null;
  "quantidade-de-pares": string | null;
  vendedor: string | null;
  designer: string | null;
  contact_id: string | null;
  organization_id: string | null;
  api_updated_at: string | null;
}

interface ChartPieEstadosProps {
  deals: Deal[];
  prevDeals?: Deal[];
  title?: string;
  description?: string;
  showTabs?: boolean;
}

// Helper function to process deals data
function processEstadosData(deals: Deal[]) {
  // Processar dados dos deals para agrupar por estado
  const estadosData = deals.reduce(
    (acc, deal) => {
      const estado = normalizeEstado(deal.estado);
      const value = (deal.value || 0) / 100; // Dividir por 100 para obter valor real

      if (!acc[estado]) {
        acc[estado] = 0;
      }
      acc[estado] += value;

      return acc;
    },
    {} as Record<string, number>,
  );

  // Arredondar valores para duas casas decimais
  Object.keys(estadosData).forEach((estado) => {
    estadosData[estado] = Math.round(estadosData[estado] * 100) / 100;
  });

  // Converter para formato do chart e ordenar por valor
  const sortedEstados = Object.entries(estadosData).sort((a, b) => b[1] - a[1]);

  // Criar configuração dinâmica do chart para todos os estados
  const chartConfig = sortedEstados.reduce(
    (config, [estado], index) => {
      const sigla = getEstadoSigla(estado);
      const key = sigla.toLowerCase();
      config[key] = {
        label: sigla, // Usar sigla no tooltip
        color: CHART_COLORS[index % CHART_COLORS.length],
      };
      return config;
    },
    {
      value: {
        label: "Valor (R$)",
      },
    } as ChartConfig,
  );

  // Criar dados do chart com cores diretas (todos os estados para o gráfico)
  const fullChartData = sortedEstados
    .filter(([, value]) => value > 0)
    .map(([estado, value], index) => {
      const sigla = getEstadoSigla(estado);
      return {
        estado: sigla, // Usar sigla nos dados
        value,
        fill: CHART_COLORS[index % CHART_COLORS.length], // Cor direta
      };
    });

  // Get top 5 for the legend/table only
  const legendData = fullChartData.slice(0, 5);

  // Calcular total para mostrar no footer
  const totalValue = fullChartData.reduce((sum, item) => sum + item.value, 0);
  const topEstado = fullChartData[0];

  return {
    chartConfig,
    chartData: fullChartData,
    legendData,
    totalValue,
    topEstado,
  };
}

export function ChartPieEstados({
  deals,
  prevDeals,
  title = "Vendas por Estado",
  showTabs = false,
}: ChartPieEstadosProps) {
  const [activeTab, setActiveTab] = useState<"current" | "previous">("current");

  const currentYearData = processEstadosData(deals);
  const prevYearData = prevDeals ? processEstadosData(prevDeals) : null;

  const hasTabs = showTabs && !!prevYearData;
  const activeData =
    hasTabs && activeTab === "previous" ? prevYearData! : currentYearData;

  return (
    <Widget className="gap-0">
      <WidgetHeader className="border-b">
        <WidgetTitle className="text-lg">{title}</WidgetTitle>
        <WidgetTitle className="text-lg">
          {activeData.chartData.length} estados
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
                      <span className="font-medium">{name}</span>
                      <span className="text-muted-foreground">
                        {formatCurrency(Number(value), "BRL")}
                      </span>
                    </div>
                  )}
                  hideLabel
                />
              }
            />
            <Pie data={activeData.chartData} dataKey="value" nameKey="estado" />
          </PieChart>
        </ChartContainer>
      </WidgetContent>

      <WidgetFooter className="gap-3 border-t">
        {/* Legend */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          {activeData.legendData.map((item) => (
            <div key={item.estado} className="flex items-center gap-1.5">
              <div
                className="size-2.5 rounded-full shrink-0"
                style={{ backgroundColor: item.fill }}
              />
              <Label
                className="text-muted-foreground text-xs cursor-default"
                title={item.estado}
              >
                {item.estado.length > 7
                  ? item.estado.slice(0, 7) + "…"
                  : item.estado}
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
