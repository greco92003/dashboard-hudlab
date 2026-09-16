"use client";

import {
  addDays,
  endOfMonth,
  format,
  startOfMonth,
  addMonths,
} from "date-fns";
import Calendar23 from "@/components/calendar-23";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import type { Agrupamento } from "@/lib/fluxo-caixa/regras";

export type Atalho = "7d" | "30d" | "90d" | "mes" | "proximo_mes" | "personalizado";

export type Periodo = {
  atalho: Atalho;
  inicio: string;
  fim: string;
};

function iso(data: Date): string {
  return format(data, "yyyy-MM-dd");
}

export function periodoDoAtalho(atalho: Atalho, hoje = new Date()): Periodo {
  switch (atalho) {
    case "7d":
      return { atalho, inicio: iso(hoje), fim: iso(addDays(hoje, 6)) };
    case "30d":
      return { atalho, inicio: iso(hoje), fim: iso(addDays(hoje, 29)) };
    case "90d":
      return { atalho, inicio: iso(hoje), fim: iso(addDays(hoje, 89)) };
    case "mes":
      return {
        atalho,
        inicio: iso(startOfMonth(hoje)),
        fim: iso(endOfMonth(hoje)),
      };
    case "proximo_mes": {
      const proximo = addMonths(hoje, 1);
      return {
        atalho,
        inicio: iso(startOfMonth(proximo)),
        fim: iso(endOfMonth(proximo)),
      };
    }
    case "personalizado":
      return { atalho, inicio: iso(hoje), fim: iso(addDays(hoje, 29)) };
  }
}

const ATALHOS: { valor: Atalho; rotulo: string }[] = [
  { valor: "7d", rotulo: "Próximos 7 dias" },
  { valor: "30d", rotulo: "Próximos 30 dias" },
  { valor: "90d", rotulo: "Próximos 90 dias" },
  { valor: "mes", rotulo: "Este mês" },
  { valor: "proximo_mes", rotulo: "Mês que vem" },
  { valor: "personalizado", rotulo: "Personalizado" },
];

export function PeriodoFluxo({
  periodo,
  agrupamento,
  onPeriodo,
  onAgrupamento,
}: {
  periodo: Periodo;
  agrupamento: Agrupamento;
  onPeriodo: (periodo: Periodo) => void;
  onAgrupamento: (agrupamento: Agrupamento) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={periodo.atalho}
        onValueChange={(valor) => {
          const atalho = valor as Atalho;
          if (atalho === "personalizado") {
            onPeriodo({ atalho, inicio: periodo.inicio, fim: periodo.fim });
            return;
          }
          onPeriodo(periodoDoAtalho(atalho));
        }}
      >
        <SelectTrigger className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ATALHOS.map((a) => (
            <SelectItem key={a.valor} value={a.valor}>
              {a.rotulo}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {periodo.atalho === "personalizado" && (
        <Calendar23
          hideLabel
          value={{
            from: periodo.inicio ? new Date(`${periodo.inicio}T12:00:00`) : undefined,
            to: periodo.fim ? new Date(`${periodo.fim}T12:00:00`) : undefined,
          }}
          onChange={(range) => {
            if (!range?.from || !range?.to) return;
            onPeriodo({
              atalho: "personalizado",
              inicio: iso(range.from),
              fim: iso(range.to),
            });
          }}
        />
      )}

      <ToggleGroup
        type="single"
        variant="outline"
        value={agrupamento}
        onValueChange={(valor) => {
          if (valor) onAgrupamento(valor as Agrupamento);
        }}
      >
        <ToggleGroupItem value="dia">Dia</ToggleGroupItem>
        <ToggleGroupItem value="semana">Semana</ToggleGroupItem>
        <ToggleGroupItem value="mes">Mês</ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
