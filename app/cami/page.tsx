"use client";

import { useCallback, useEffect, useState } from "react";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { toast } from "sonner";
import { Bot, Gauge, Inbox, ListChecks, Loader2, MessagesSquare, RefreshCw, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CamiControl } from "@/components/cami/control";
import { CamiConversations } from "@/components/cami/conversations";
import { CamiOverview } from "@/components/cami/overview";
import { CamiAnnex } from "@/components/cami/annex";
import { ESTADO_LABEL, fmtDateTime } from "@/components/cami/format";
import { UnreadInbox } from "@/components/sellers-v2/unread-inbox";
import { usePermissions } from "@/hooks/usePermissions";
import type { ConversationItem, OverviewPayload } from "@/lib/ghl/ai-seller/intel-load";
import type { Periodo } from "@/lib/ghl/ai-seller/intel";
import { fmtVigencia, promocaoAtiva } from "@/lib/ghl/ai-seller/vigentes";
import { cn } from "@/lib/utils";

const TABS = ["visao", "conversas", "anexo", "nao-lidas", "controle"] as const;
const PERIODOS: Array<{ id: Periodo; label: string }> = [
  { id: "hoje", label: "Hoje" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "tudo", label: "Desde o lançamento" },
];
const PERIODO_IDS = PERIODOS.map((p) => p.id);

export default function CamiIntelligencePage() {
  const [{ tab, periodo, conversa }, setRoute] = useQueryStates(
    {
      tab: parseAsStringLiteral(TABS).withDefault("visao"),
      periodo: parseAsStringLiteral(PERIODO_IDS).withDefault("7d"),
      // Atendimento aberto (link de push: /cami?tab=conversas&conversa=<oportunidade>).
      conversa: parseAsString,
    },
    { history: "replace" },
  );
  const { isOwner } = usePermissions();

  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const res = await fetch(`/api/cami/overview?periodo=${periodo}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao carregar a visão geral");
      setOverview(data);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setOverviewLoading(false);
    }
  }, [periodo]);

  const loadConversations = useCallback(async () => {
    setConversationsLoading(true);
    try {
      const res = await fetch("/api/cami/conversations", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao carregar as conversas");
      setConversations(data.items ?? []);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setConversationsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);
  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/cami/refresh", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao atualizar");
      toast.success(
        data.erros
          ? `${data.conversas} conversas atualizadas, ${data.erros} com erro`
          : `${data.conversas} conversas atualizadas`,
      );
      await Promise.all([loadOverview(), loadConversations()]);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRefreshing(false);
    }
  };

  const settings = overview?.settings;
  const promoAtiva = promocaoAtiva(settings?.promocao, Date.now());
  const paraRevisar = conversations.filter((c) => c.paraRevisar).length;
  const estadoClass =
    settings?.estado === "ligada"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
      : settings?.estado === "desligada"
        ? "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30"
        : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";

  return (
    <div className="flex flex-1 flex-col gap-4 sm:gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold flex items-center gap-2">
            <Bot className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            CAMI Intelligence
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs sm:text-sm text-muted-foreground">
            {settings ? (
              <>
                <Badge variant="outline" className={cn("font-medium", estadoClass)}>
                  {ESTADO_LABEL[settings.estado]}
                </Badge>
                <span>
                  {settings.minPares === settings.maxPares
                    ? `${settings.minPares} pares`
                    : `${settings.minPares} a ${settings.maxPares} pares`}{" "}
                  · passa para {settings.escalationName}
                </span>
                <span>· atualizado {fmtDateTime(overview?.atualizadoEm)}</span>
                {promoAtiva && (
                  <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200">
                    {promoAtiva.nome}: {promoAtiva.descontoPct}% até {fmtVigencia(promoAtiva.fim)}
                  </Badge>
                )}
              </>
            ) : (
              <span>Carregando…</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border p-0.5" role="group" aria-label="Período">
            {PERIODOS.map((p) => (
              <Button
                key={p.id}
                size="sm"
                variant={periodo === p.id ? "default" : "ghost"}
                onClick={() => void setRoute({ periodo: p.id })}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => void setRoute({ tab: v as (typeof TABS)[number] })} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="visao" className="flex items-center gap-2">
            <Gauge className="h-4 w-4" />
            <span className="hidden sm:inline">Visão geral</span>
            <span className="sm:hidden">Visão</span>
          </TabsTrigger>
          <TabsTrigger value="conversas" className="flex items-center gap-2">
            <MessagesSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Conversas</span>
            <span className="sm:hidden">Conv.</span>
            {paraRevisar > 0 && (
              <span className="rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white">{paraRevisar}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="anexo" className="flex items-center gap-2">
            <ListChecks className="h-4 w-4" />
            <span className="hidden sm:inline">Anexo</span>
            <span className="sm:hidden">Anexo</span>
          </TabsTrigger>
          <TabsTrigger value="nao-lidas" className="flex items-center gap-2">
            <Inbox className="h-4 w-4" />
            <span className="hidden sm:inline">Não lidas</span>
            <span className="sm:hidden">Fila</span>
          </TabsTrigger>
          <TabsTrigger value="controle" className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            <span>Controle</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visao" className="mt-4">
          <CamiOverview data={overview} loading={overviewLoading} />
        </TabsContent>
        <TabsContent value="conversas" className="mt-4">
          <CamiConversations
            items={conversations}
            loading={conversationsLoading}
            isOwner={isOwner}
            escalationName={settings?.escalationName ?? "Schay"}
            openId={conversa}
            onOpenChange={(id) => void setRoute({ conversa: id })}
            onReviewed={() => void loadConversations()}
          />
        </TabsContent>
        <TabsContent value="anexo" className="mt-4">
          <CamiAnnex />
        </TabsContent>
        <TabsContent value="nao-lidas" className="mt-4">
          <UnreadInbox />
        </TabsContent>
        <TabsContent value="controle" className="mt-4">
          <CamiControl onSaved={() => void loadOverview()} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
