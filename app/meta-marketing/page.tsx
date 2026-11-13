"use client";

import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { SeletorPeriodo, usePeriodoParams } from "@/components/seletor-periodo";
import { VisaoGeral } from "./components/visao-geral";
import { Anuncios } from "./components/anuncios";
import { Regioes } from "./components/regioes";
import { Saude } from "./components/saude";
import { Insights } from "./components/insights";
import { Criativos } from "./components/criativos";
import { BarraDeFiltros, CabecalhoDaPagina, Campo, GrupoDeAcoes } from "@/components/hud/pagina";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMeta } from "@fortawesome/free-brands-svg-icons";

const ABAS = ["visao-geral", "anuncios", "regioes", "saude", "insights", "criativos"] as const;

function MetaMarketingContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const abaParam = searchParams.get("aba");
  const aba = (ABAS as readonly string[]).includes(abaParam ?? "")
    ? (abaParam as (typeof ABAS)[number])
    : "visao-geral";

  const { periodo, customRange } = usePeriodoParams();

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch("/api/meta-ghl/refresh", { method: "POST" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        toast.error("Falha ao sincronizar. Tente de novo em instantes.");
        return;
      }
      if (data.alreadyRunning) {
        toast.info("Uma sincronização recente já está em andamento. Aguarde os dados atualizarem.");
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
    <div className="hud-page">
      <CabecalhoDaPagina
        icone={MetaIcon}
        titulo="Meta Marketing"
        descricao="Cruzamento de anúncios do Meta Ads com leads e vendas do GoHighLevel"
        acoes={
          <GrupoDeAcoes rotulo="Ações do Meta Marketing">
            <button type="button" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={isRefreshing ? "animate-spin" : undefined} />
              {isRefreshing ? "Atualizando..." : "Atualizar"}
            </button>
          </GrupoDeAcoes>
        }
      />

      {(aba === "visao-geral" || aba === "anuncios" || aba === "regioes") && (
        <BarraDeFiltros>
          <Campo rotulo="Período">
            <SeletorPeriodo />
          </Campo>
        </BarraDeFiltros>
      )}

      <Tabs value={aba} onValueChange={(value) => setParam("aba", value)}>
        <div className="overflow-x-auto py-0.5">
          <TabsList className="hud-marketing-tabs">
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
          <Regioes periodo={periodo} customRange={customRange} refreshKey={refreshKey} />
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

const MetaIcon = ({ className }: { className?: string }) => (
  <FontAwesomeIcon icon={faMeta} className={className} />
);

export default function MetaMarketingPage() {
  return (
    <Suspense
      fallback={
        <div className="hud-page">
          <Skeleton className="h-96" />
        </div>
      }
    >
      <MetaMarketingContent />
    </Suspense>
  );
}
