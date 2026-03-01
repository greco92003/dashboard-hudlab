"use client";

import { TrendingUp } from "lucide-react";
import { Pie, PieChart } from "recharts";

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
  title?: string;
  description?: string;
}

export function ChartPieEstados({
  deals,
  title = "Vendas por Estado",
  description = "Distribuição do faturamento por estado brasileiro",
}: ChartPieEstadosProps) {
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
    } as ChartConfig,
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

  // Calcular total para mostrar no footer
  const totalValue = chartData.reduce((sum, item) => sum + item.value, 0);
  const topEstado = chartData[0];

  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-0">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pt-0 px-2 sm:px-6 pb-2">
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 items-start lg:items-center">
          {/* Gráfico - primeiro no mobile, à direita no desktop */}
          <div className="w-full lg:w-2/3 flex flex-col justify-center order-1 lg:order-2">
            <ChartContainer
              config={chartConfig}
              className="[&_.recharts-pie-label-text]:fill-foreground w-full h-[250px] sm:h-[300px] lg:h-[400px] overflow-visible"
            >
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Pie
                  data={chartData}
                  dataKey="value"
                  label={({ value }) => formatCurrency(Number(value), "BRL")}
                  nameKey="estado"
                  outerRadius="80%"
                  innerRadius={0}
                  cx="50%"
                  cy="50%"
                />
              </PieChart>
            </ChartContainer>

            {/* Informações do gráfico */}
            <div className="flex flex-col gap-2 text-xs sm:text-sm mt-2 text-center">
              {topEstado && (
                <div className="flex items-center justify-center gap-2 leading-none font-medium">
                  {topEstado.estado} lidera com{" "}
                  {formatCurrency(topEstado.value, "BRL")}{" "}
                  <TrendingUp className="h-4 w-4" />
                </div>
              )}
              <div className="text-muted-foreground leading-none">
                Total de {formatCurrency(totalValue, "BRL")} em{" "}
                {chartData.length} estados
              </div>
            </div>
          </div>

          {/* Tabela - segunda no mobile, à esquerda no desktop */}
          <div className="w-full lg:w-1/3 order-2 lg:order-1">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs sm:text-sm">Estado</TableHead>
                    <TableHead className="text-right text-xs sm:text-sm">
                      Valor
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chartData.map((item, index) => (
                    <TableRow key={item.estado}>
                      <TableCell className="flex items-center gap-2 text-xs sm:text-sm">
                        <div
                          className="w-2 h-2 sm:w-3 sm:h-3 rounded-full"
                          style={{ backgroundColor: item.fill }}
                        />
                        {item.estado}
                      </TableCell>
                      <TableCell className="text-right font-medium text-xs sm:text-sm">
                        {formatCurrency(item.value, "BRL")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
