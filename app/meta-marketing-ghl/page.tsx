"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { VisaoGeral } from "./components/visao-geral";
import { Anuncios } from "./components/anuncios";
import { Regioes } from "./components/regioes";
import { Saude } from "./components/saude";
import { PERIODOS, type Periodo } from "./lib";

const ABAS = ["visao-geral", "anuncios", "regioes", "saude"] as const;

function MetaMarketingGhlContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const abaParam = searchParams.get("aba");
  const aba = (ABAS as readonly string[]).includes(abaParam ?? "")
    ? (abaParam as (typeof ABAS)[number])
    : "visao-geral";

  const periodoParam = searchParams.get("periodo");
  const periodo: Periodo = PERIODOS.some((p) => p.value === periodoParam)
    ? (periodoParam as Periodo)
    : "30d";

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

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
          <Select
            value={periodo}
            onValueChange={(v) => setParam("periodo", v)}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODOS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Tabs value={aba} onValueChange={(v) => setParam("aba", v)}>
        <TabsList>
          <TabsTrigger value="visao-geral">Visão Geral</TabsTrigger>
          <TabsTrigger value="anuncios">Anúncios</TabsTrigger>
          <TabsTrigger value="regioes">Regiões</TabsTrigger>
          <TabsTrigger value="saude">Saúde da Atribuição</TabsTrigger>
        </TabsList>
        <TabsContent value="visao-geral" className="mt-4">
          <VisaoGeral periodo={periodo} />
        </TabsContent>
        <TabsContent value="anuncios" className="mt-4">
          <Anuncios periodo={periodo} />
        </TabsContent>
        <TabsContent value="regioes" className="mt-4">
          <Regioes />
        </TabsContent>
        <TabsContent value="saude" className="mt-4">
          <Saude />
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
