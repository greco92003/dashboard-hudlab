"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { DateRange } from "react-day-picker";
import Calendar23 from "@/components/calendar-23";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  PERIODOS,
  dateParaIso,
  type Periodo,
  type RangeCustom,
} from "@/lib/periodo";

/**
 * Período selecionado, lido da URL (`?periodo=&inicio=&fim=`).
 *
 * O estado mora na URL, e não em localStorage, para que o link do período
 * seja compartilhável e o voltar do navegador funcione. Como usa
 * useSearchParams, a página precisa de um <Suspense> em volta.
 */
export function usePeriodoParams(): {
  periodo: Periodo;
  customRange: RangeCustom | undefined;
} {
  const searchParams = useSearchParams();

  const inicioParam = searchParams.get("inicio");
  const fimParam = searchParams.get("fim");
  const customRange: RangeCustom | undefined =
    inicioParam && fimParam ? { inicio: inicioParam, fim: fimParam } : undefined;

  const periodoParam = searchParams.get("periodo");
  const periodo: Periodo =
    periodoParam === "custom" && customRange
      ? "custom"
      : PERIODOS.some((item) => item.value === periodoParam)
        ? (periodoParam as Periodo)
        : "30d";

  return { periodo, customRange };
}

/**
 * Presets de período + intervalo personalizado. Escolher no calendário troca
 * o preset por "custom"; escolher um preset limpa o intervalo.
 */
export function SeletorPeriodo({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { periodo, customRange } = usePeriodoParams();

  const setParams = (entries: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(entries)) {
      if (value == null) params.delete(key);
      else params.set(key, value);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleCalendarChange = (range: DateRange | undefined) => {
    if (range?.from && range?.to) {
      setParams({
        periodo: "custom",
        inicio: dateParaIso(range.from),
        fim: dateParaIso(range.to),
      });
    }
  };

  const calendarValue: DateRange | undefined =
    periodo === "custom" && customRange
      ? {
          from: new Date(`${customRange.inicio}T12:00:00`),
          to: new Date(`${customRange.fim}T12:00:00`),
        }
      : undefined;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Select
        value={periodo === "custom" ? "" : periodo}
        onValueChange={(value) =>
          setParams({ periodo: value, inicio: null, fim: null })
        }
      >
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Selecionar" />
        </SelectTrigger>
        <SelectContent>
          {PERIODOS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Calendar23 value={calendarValue} onChange={handleCalendarChange} hideLabel />
    </div>
  );
}
