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
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";

// Cores distintas para o gráfico (usando cores diretas que funcionam com Recharts)
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

interface NuvemshopOrder {
  id: string;
  order_id: string;
  total: number | null;
  subtotal: number | null;
  promotional_discount: number | null;
  discount_coupon: number | null;
  discount_gateway: number | null;
  shipping_cost_customer: number | null;
  province: string | null;
}

interface ChartPieEstadosNuvemshopProps {
  orders: NuvemshopOrder[];
  loading?: boolean;
}

// Mapeamento de províncias para siglas de estados brasileiros
const PROVINCE_TO_STATE: Record<string, string> = {
  // Estados completos
  Acre: "AC",
  Alagoas: "AL",
  Amapá: "AP",
  Amazonas: "AM",
  Bahia: "BA",
  Ceará: "CE",
  "Distrito Federal": "DF",
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

  // Siglas (caso já venham como sigla)
  AC: "AC",
  AL: "AL",
  AP: "AP",
  AM: "AM",
  BA: "BA",
  CE: "CE",
  DF: "DF",
  ES: "ES",
  GO: "GO",
  MA: "MA",
  MT: "MT",
  MS: "MS",
  MG: "MG",
  PA: "PA",
  PB: "PB",
  PR: "PR",
  PE: "PE",
  PI: "PI",
  RJ: "RJ",
  RN: "RN",
  RS: "RS",
  RO: "RO",
  RR: "RR",
  SC: "SC",
  SP: "SP",
  SE: "SE",
  TO: "TO",
};

// Função para normalizar nome do estado
function normalizeEstado(estado: string | null): string {
  if (!estado) return "Não informado";

  const estadoTrimmed = estado.trim();

  // Verificar se já é uma sigla conhecida ou nome completo
  const sigla = PROVINCE_TO_STATE[estadoTrimmed];
  if (sigla) {
    return sigla;
  }

  // Tentar encontrar por correspondência parcial (case insensitive)
  const estadoLower = estadoTrimmed.toLowerCase();
  for (const [key, value] of Object.entries(PROVINCE_TO_STATE)) {
    if (
      key.toLowerCase().includes(estadoLower) ||
      estadoLower.includes(key.toLowerCase())
    ) {
      return value;
    }
  }

  // Se não encontrar, retornar o valor original truncado
  return estadoTrimmed.length > 10
    ? estadoTrimmed.substring(0, 10) + "..."
    : estadoTrimmed;
}

// Função para obter sigla do estado
function getEstadoSigla(estado: string): string {
  return PROVINCE_TO_STATE[estado] || estado;
}

// Function to calculate real revenue (subtotal - discounts, without shipping)
function calculateRealRevenue(order: NuvemshopOrder): number {
  const subtotal =
    typeof order.subtotal === "string"
      ? parseFloat(order.subtotal)
      : order.subtotal || 0;

  const promotionalDiscount =
    typeof order.promotional_discount === "string"
      ? parseFloat(order.promotional_discount)
      : order.promotional_discount || 0;

  const discountCoupon =
    typeof order.discount_coupon === "string"
      ? parseFloat(order.discount_coupon)
      : order.discount_coupon || 0;

  const discountGateway =
    typeof order.discount_gateway === "string"
      ? parseFloat(order.discount_gateway)
      : order.discount_gateway || 0;

  // Calculate: subtotal - all discounts (without shipping)
  const realRevenue =
    subtotal - promotionalDiscount - discountCoupon - discountGateway;

  return isNaN(realRevenue) ? 0 : Math.max(0, realRevenue); // Ensure non-negative
}

export function ChartPieEstadosNuvemshop({
  orders,
  loading = false,
}: ChartPieEstadosNuvemshopProps) {
  // Show skeleton while loading
  if (loading) {
    return (
      <Card className="h-auto lg:h-[400px] flex flex-col">
        <CardHeader className="pb-2 sm:pb-0">
          <CardTitle className="text-base sm:text-lg">
            Vendas por Estado
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Distribuição do faturamento real por estado (sem frete e descontos)
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 pt-0 px-2 sm:px-6 pb-6">
          <div className="flex flex-col lg:flex-row gap-4 lg:gap-4 items-start lg:items-center h-full">
            {/* Chart skeleton - primeiro no mobile, à direita no desktop */}
            <div className="w-full lg:w-2/3 flex flex-col justify-center order-1 lg:order-2 min-h-0">
              <div className="w-full h-[280px] sm:h-[320px] lg:h-[280px] flex items-center justify-center">
                <Skeleton className="h-[200px] w-[200px] rounded-full" />
              </div>

              {/* Info skeleton */}
              <div className="flex flex-col gap-1 text-xs sm:text-sm mt-2 text-center px-2">
                <Skeleton className="h-4 w-[200px] mx-auto" />
                <Skeleton className="h-3 w-[150px] mx-auto" />
              </div>
            </div>

            {/* List skeleton - segundo no mobile, à esquerda no desktop */}
            <div className="w-full lg:w-1/3 order-2 lg:order-1 min-h-0 mt-4 lg:mt-0">
              <div className="border rounded-lg p-2 bg-muted/20 max-h-[280px] lg:max-h-[280px] overflow-y-auto">
                <div className="space-y-1">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-1.5 rounded-md bg-background border border-border/50"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Skeleton className="w-2.5 h-2.5 rounded-full" />
                        <Skeleton className="h-3 w-8" />
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <Skeleton className="h-3 w-16 mb-1" />
                        <Skeleton className="h-2 w-10" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
  // Processar dados dos pedidos para agrupar por estado
  const estadosData = orders.reduce((acc, order) => {
    const estado = normalizeEstado(order.province);
    const value = calculateRealRevenue(order);

    if (!acc[estado]) {
      acc[estado] = 0;
    }
    acc[estado] += value;

    return acc;
  }, {} as Record<string, number>);

  // Arredondar valores para duas casas decimais
  Object.keys(estadosData).forEach((estado) => {
    estadosData[estado] = Math.round(estadosData[estado] * 100) / 100;
  });

  // Converter para formato do chart e ordenar por valor
  const sortedEstados = Object.entries(estadosData).sort((a, b) => b[1] - a[1]);

  // Criar configuração dinâmica do chart primeiro (usando siglas)
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
    } as ChartConfig
  );

  // Criar dados do chart com cores diretas
  const chartData = sortedEstados.map(([estado, value], index) => {
    const sigla = getEstadoSigla(estado);
    return {
      estado: sigla, // Usar sigla nos dados
      value,
      fill: CHART_COLORS[index % CHART_COLORS.length], // Cor direta
    };
  });

  // Calcular estatísticas
  const totalValue = sortedEstados.reduce((sum, [, value]) => sum + value, 0);
  const topEstado =
    sortedEstados.length > 0
      ? {
          estado: getEstadoSigla(sortedEstados[0][0]),
          value: sortedEstados[0][1],
        }
      : null;

  return (
    <Card className="h-auto lg:h-[400px] flex flex-col">
      <CardHeader className="pb-2 sm:pb-0">
        <CardTitle className="text-base sm:text-lg">
          Vendas por Estado
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Distribuição do faturamento real por estado (sem frete e descontos)
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 pt-0 px-2 sm:px-6 pb-6">
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-4 items-start lg:items-center h-full">
          {/* Gráfico - primeiro no mobile, à direita no desktop */}
          <div className="w-full lg:w-2/3 flex flex-col justify-center order-1 lg:order-2 min-h-0">
            <ChartContainer
              config={chartConfig}
              className="[&_.recharts-pie-label-text]:fill-foreground w-full h-[280px] sm:h-[320px] lg:h-[280px] overflow-visible"
            >
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Pie
                  data={chartData}
                  dataKey="value"
                  label={({ value }) => formatCurrency(Number(value), "BRL")}
                  nameKey="estado"
                  outerRadius="65%"
                  innerRadius={0}
                  cx="50%"
                  cy="50%"
                />
              </PieChart>
            </ChartContainer>

            {/* Informações do gráfico */}
            <div className="flex flex-col gap-1 text-xs sm:text-sm mt-2 text-center px-2">
              {topEstado && (
                <div className="flex items-center justify-center gap-2 leading-none font-medium flex-wrap">
                  <span>{topEstado.estado} lidera com</span>
                  <span className="flex items-center gap-1">
                    {formatCurrency(topEstado.value, "BRL")}
                    <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4" />
                  </span>
                </div>
              )}
              <div className="text-muted-foreground leading-none">
                Total de {formatCurrency(totalValue, "BRL")} em{" "}
                {chartData.length} estados
              </div>
            </div>
          </div>

          {/* Lista de estados - segundo no mobile, à esquerda no desktop */}
          <div className="w-full lg:w-1/3 order-2 lg:order-1 min-h-0 mt-4 lg:mt-0">
            <div className="border rounded-lg p-2 bg-muted/20 max-h-[280px] lg:max-h-[280px] overflow-y-auto">
              <div className="space-y-1">
                {sortedEstados.map(([estado, value], index) => {
                  const sigla = getEstadoSigla(estado);
                  const percentage =
                    totalValue > 0 ? (value / totalValue) * 100 : 0;
                  const color = CHART_COLORS[index % CHART_COLORS.length];

                  return (
                    <div
                      key={estado}
                      className="flex items-center justify-between p-1.5 rounded-md bg-background hover:bg-muted/50 transition-colors border border-border/50"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="font-medium text-xs truncate">
                          {sigla}
                        </span>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <div className="font-semibold text-xs">
                          {formatCurrency(value, "BRL")}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {percentage.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
