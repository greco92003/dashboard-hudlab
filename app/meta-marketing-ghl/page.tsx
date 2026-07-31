"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { DateRange } from "react-day-picker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import Calendar23 from "@/components/calendar-23";
import { VisaoGeral } from "./components/visao-geral";
import { Anuncios } from "./components/anuncios";
import { Regioes } from "./components/regioes";
import { Saude } from "./components/saude";
import { Insights } from "./components/insights";
import { PERIODOS, dateParaIso, type Periodo, type RangeCustom } from "./lib";

const ABAS = ["visao-geral", "anuncios", "regioes", "saude", "insights"] as const;

function MetaMarketingGhlContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const abaParam = searchParams.get("aba");
  const aba = (ABAS as readonly string[]).includes(abaParam ?? "")
    ? (abaParam as (typeof ABAS)[number])
    : "visao-geral";

  const inicioParam = searchParams.get("inicio");
  const fimParam = searchParams.get("fim");
  const customRange: RangeCustom | undefined =
    inicioParam && fimParam ? { inicio: inicioParam, fim: fimParam } : undefined;

  const periodoParam = searchParams.get("periodo");
  const periodo: Periodo =
    periodoParam === "custom" && customRange
      ? "custom"
      : PERIODOS.some((p) => p.value === periodoParam)
        ? (periodoParam as Periodo)
        : "30d";

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Atualiza vários parâmetros de uma vez (ex: periodo+inicio+fim juntos)
  // -- evita condição de corrida de chamar setParam 3x seguidas a partir
  // do mesmo searchParams "velho".
  const setParams = (entries: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(entries)) {
      if (value == null) params.delete(key);
      else params.set(key, value);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handlePeriodoPreset = (v: string) => {
    setParams({ periodo: v, inicio: null, fim: null });
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
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Meta Marketing GHL
          </h1>
          <p className="text-muted-foreground">
            Cruzamento de anúncios do Meta Ads com leads e vendas do GoHighLevel
          </p>
        </div>
        {(aba === "visao-geral" || aba === "anuncios") && (
          <div className="flex flex-wrap items-center gap-2">
            <Select value={periodo === "custom" ? "" : periodo} onValueChange={handlePeriodoPreset}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Selecionar" />
              </SelectTrigger>
              <SelectContent>
                {PERIODOS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Calendar23 value={calendarValue} onChange={handleCalendarChange} hideLabel />
          </div>
        )}
      </div>

      <Tabs value={aba} onValueChange={(v) => setParam("aba", v)}>
        <TabsList>
          <TabsTrigger value="visao-geral">Visão Geral</TabsTrigger>
          <TabsTrigger value="anuncios">Anúncios</TabsTrigger>
          <TabsTrigger value="regioes">Regiões</TabsTrigger>
          <TabsTrigger value="saude">Saúde da Atribuição</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>
        <TabsContent value="visao-geral" className="mt-4">
          <VisaoGeral periodo={periodo} customRange={customRange} />
        </TabsContent>
        <TabsContent value="anuncios" className="mt-4">
          <Anuncios periodo={periodo} customRange={customRange} />
        </TabsContent>
        <TabsContent value="regioes" className="mt-4">
          <Regioes />
        </TabsContent>
        <TabsContent value="saude" className="mt-4">
          <Saude />
        </TabsContent>
        <TabsContent value="insights" className="mt-4">
          <Insights />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function MetaMarketingGhlPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto p-6">
          <Skeleton className="h-96" />
        </div>
      }
    >
      <MetaMarketingGhlContent />
    </Suspense>
  );
}
