"use client";

import { ComposedChart } from "@/components/charts/composed-chart";
import { Grid } from "@/components/charts/grid";
import { Line } from "@/components/charts/line";
import { SeriesBar } from "@/components/charts/series-bar";
import { XAxis } from "@/components/charts/x-axis";
import { YAxis } from "@/components/charts/y-axis";
import { ChartTooltip } from "@/components/charts/tooltip";
import { CORES, brlCompacto } from "@/components/fluxo-caixa/formatos";
import { formatCurrency } from "@/lib/utils";
import type { PontoFluxo } from "@/lib/fluxo-caixa/regras";

export function GraficoFluxo({ pontos }: { pontos: PontoFluxo[] }) {
  if (pontos.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
        Sem dados no período
      </div>
    );
  }

  const dados = pontos.map((p) => ({
    date: new Date(`${p.inicio}T12:00:00`),
    entradas: p.entradas,
    saidas: p.saidas,
    fechamento: p.fechamento,
    atrasadoEntradas: p.atrasadoEntradas,
    atrasadoSaidas: p.atrasadoSaidas,
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: CORES.entradas }}
          />
          Entradas
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: CORES.saidas }}
          />
          Saídas
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: CORES.fechamento }}
          />
          Fechamento
        </span>
      </div>

      <ComposedChart
        data={dados}
        xDataKey="date"
        aspectRatio="2.5 / 1"
        maxBarSize={28}
        barGap={2}
      >
        <Grid />
        <SeriesBar dataKey="entradas" fill={CORES.entradas} radius={2} />
        <SeriesBar dataKey="saidas" fill={CORES.saidas} radius={2} />
        <Line dataKey="fechamento" stroke={CORES.fechamento} strokeWidth={2} />
        <XAxis numTicks={6} />
        <YAxis formatValue={brlCompacto} />
        <ChartTooltip
          rows={(p) => {
            const rows = [
              { label: "Entradas", value: p.entradas as number, color: CORES.entradas },
              { label: "Saídas", value: p.saidas as number, color: CORES.saidas },
              { label: "Fechamento", value: p.fechamento as number, color: CORES.fechamento },
            ].map((r) => ({ ...r, value: formatCurrency(r.value) }));

            const atrasadoSaidas = p.atrasadoSaidas as number;
            const atrasadoEntradas = p.atrasadoEntradas as number;
            if (atrasadoSaidas !== 0) {
              rows.push({
                label: "Inclui atrasadas a pagar",
                value: formatCurrency(atrasadoSaidas),
                color: CORES.saidas,
              });
            }
            if (atrasadoEntradas !== 0) {
              rows.push({
                label: "Inclui atrasadas a receber",
                value: formatCurrency(atrasadoEntradas),
                color: CORES.entradas,
              });
            }
            return rows;
          }}
        />
      </ComposedChart>
    </div>
  );
}
