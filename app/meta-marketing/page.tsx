"use client";

import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";
import { RefreshCw, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
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
import { Criativos } from "./components/criativos";
import { PERIODOS, dateParaIso, type Periodo, type RangeCustom } from "./lib";

const ABAS = ["visao-geral", "anuncios", "regioes", "saude", "insights", "criativos"] as const;

function MetaMarketingContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const { state: sidebarState, toggleSidebar } = useSidebar();
  const sidebarAberta = sidebarState === "expanded";

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

  const setParams = (entries: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(entries)) {
      if (value == null) params.delete(key);
      else params.set(key, value);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handlePeriodoPreset = (value: string) => {
    setParams({ periodo: value, inicio: null, fim: null });
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

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch("/api/meta-ghl/refresh", { method: "POST" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        toast.error("Falha ao sincronizar. Tente de novo em instantes.");
        return;
      }
      toast.success("Sincronização iniciada — os dados atualizam em alguns segundos.");
      await new Promise((resolve) => setTimeout(resolve, 8000));
      setRefreshKey((key) => key + 1);
    } catch {
      toast.error("Falha ao sincronizar. Tente de novo em instantes.");
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Meta Marketing</h1>
          <p className="text-muted-foreground">
            Cruzamento de anúncios do Meta Ads com leads e vendas do GoHighLevel
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={toggleSidebar}
            className="flex items-center gap-2"
          >
            {sidebarAberta ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
            {sidebarAberta ? "Ocultar menu" : "Mostrar menu"}
          </Button>
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "Atualizando..." : "Atualizar"}
          </Button>
          {(aba === "visao-geral" || aba === "anuncios") && (
            <>
              <Select
                value={periodo === "custom" ? "" : periodo}
                onValueChange={handlePeriodoPreset}
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
            </>
          )}
        </div>
      </div>

      <Tabs value={aba} onValueChange={(value) => setParam("aba", value)}>
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="visao-geral">Visão Geral</TabsTrigger>
            <TabsTrigger value="anuncios">Anúncios</TabsTrigger>
            <TabsTrigger value="regioes">Regiões</TabsTrigger>
            <TabsTrigger value="saude">Saúde da Atribuição</TabsTrigger>
            <TabsTrigger value="insights">Insights</TabsTrigger>
            <TabsTrigger value="criativos">Criativos</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="visao-geral" className="mt-4">
          <VisaoGeral periodo={periodo} customRange={customRange} refreshKey={refreshKey} />
        </TabsContent>
        <TabsContent value="anuncios" className="mt-4">
          <Anuncios periodo={periodo} customRange={customRange} refreshKey={refreshKey} />
        </TabsContent>
        <TabsContent value="regioes" className="mt-4">
          <Regioes refreshKey={refreshKey} />
        </TabsContent>
        <TabsContent value="saude" className="mt-4">
          <Saude refreshKey={refreshKey} />
        </TabsContent>
        <TabsContent value="insights" className="mt-4">
          <Insights />
        </TabsContent>
        <TabsContent value="criativos" className="mt-4">
          <Criativos />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function MetaMarketingPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto p-6">
          <Skeleton className="h-96" />
        </div>
      }
    >
      <MetaMarketingContent />
    </Suspense>
  );
}
