"use client";

import { useCallback, useEffect, useState } from "react";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { toast } from "sonner";
import { Bot, Gauge, Inbox, ListChecks, Loader2, MessagesSquare, RefreshCw, SlidersHorizontal } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CamiControl } from "@/components/cami/control";
import { CamiConversations } from "@/components/cami/conversations";
import { CamiOverview } from "@/components/cami/overview";
import { CamiAnnex } from "@/components/cami/annex";
import { ESTADO_LABEL, fmtDateTime } from "@/components/cami/format";
import { UnreadInbox } from "@/components/sellers-v2/unread-inbox";
import type { ConversationItem, OverviewPayload } from "@/lib/ghl/ai-seller/intel-load";
import type { Periodo } from "@/lib/ghl/ai-seller/intel";
import { fmtVigencia, promocaoAtiva, resumoDesconto } from "@/lib/ghl/ai-seller/vigentes";
import { cn } from "@/lib/utils";
import { CabecalhoDaPagina, GrupoDeAcoes } from "@/components/hud/pagina";

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

  const [overview, setOverview] = useState<(OverviewPayload & { podeAdministrar?: boolean }) | null>(null);
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
      ? "tone-green hud-tone-chip"
      : settings?.estado === "desligada"
        ? "tone-rose hud-tone-chip"
        : "tone-pink hud-tone-chip";

  return (
    <div className="flex flex-1 flex-col gap-4 sm:gap-6">
      <CabecalhoDaPagina
        icone={Bot}
        titulo="CAMI Intelligence"
        descricao={
          settings ? (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={cn("hud-chip", estadoClass)}>{ESTADO_LABEL[settings.estado]}</span>
              <span>
                {settings.minPares === settings.maxPares
                  ? `${settings.minPares} pares`
                  : `${settings.minPares} a ${settings.maxPares} pares`}{" "}
                · passa para {settings.escalationName}
              </span>
              <span>· atualizado {fmtDateTime(overview?.atualizadoEm)}</span>
              {promoAtiva && (
                <span className="hud-chip tone-green hud-tone-chip">
                  {promoAtiva.nome}: {resumoDesconto(promoAtiva)} até {fmtVigencia(promoAtiva.fim)}
                </span>
              )}
            </span>
          ) : (
            "Carregando…"
          )
        }
        acoes={
          <div className="flex flex-wrap items-center gap-2">
            <GrupoDeAcoes rotulo="Período" separar={false}>
              {PERIODOS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={periodo === p.id}
                  onClick={() => void setRoute({ periodo: p.id })}
                >
                  {p.label}
                </button>
              ))}
            </GrupoDeAcoes>
            <GrupoDeAcoes rotulo="Ações da Cami">
              <button type="button" onClick={refresh} disabled={refreshing}>
                {refreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                Atualizar
              </button>
            </GrupoDeAcoes>
          </div>
        }
      />

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
              <span className="tone-rose hud-tone-chip rounded-full px-1.5 text-[11px] font-semibold">{paraRevisar}</span>
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
            isOwner={overview?.podeAdministrar === true}
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
