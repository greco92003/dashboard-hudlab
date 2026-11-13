"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { storage } from "@/lib/storage";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Clock,
  RefreshCw,
  PackageCheck,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { AveragePairsCalculator } from "@/components/average-pairs-calculator";
import {
  ForaDoBoard,
  type MotivoFora,
} from "@/components/programacao/fora-do-board";
import { RelatorioDialog } from "@/components/programacao/relatorio-dialog";
import { BoardColumns } from "@/components/programacao/board-columns";
import { DealCard } from "@/components/programacao/deal-card";
import { DealDialog } from "@/components/programacao/deal-dialog";
import {
  TipoPedidoFilter,
  type TipoFilterValue,
} from "@/components/programacao/tipo-pedido-filter";
import {
  getTipoPedidoRank,
  isDadosEmConferencia,
} from "@/lib/ghl/programacao-stages";
import { isOverdue, parseDate } from "@/lib/programacao/board-dates";
import type { BoardDeal, BoardGroup } from "@/lib/programacao/board-types";

const SEM_DATA_GROUP_ID = "sem-data";
// Os ids do `.in()` viajam na querystring; em lotes para não estourar a URL.
const CARD_STATE_BATCH_SIZE = 80;
const EM_ATRASO_GROUP_ID = "em-atraso";

interface ProgramacaoData {
  success: boolean;
  message: string;
  summary: {
    totalDeals: number;
    totalValue: number;
    totalGroups: number;
    totalPares: number;
    porTipo: Record<string, number>;
  };
  groups: BoardGroup[];
}

export default function ProgramacaoPage() {
  const [data, setData] = useState<ProgramacaoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<"value" | "title">("value");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedDeal, setSelectedDeal] = useState<BoardDeal | null>(null);
  const [isDealDialogOpen, setIsDealDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [tipoFilter, setTipoFilter] = useState<Set<TipoFilterValue>>(new Set());
  const [isHydrated, setIsHydrated] = useState(false);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100);
  // Quando preenchido, o board mostra só o grupo que ficou de fora dele.
  const [foraAtivo, setForaAtivo] = useState<MotivoFora | null>(null);
  const [activeCards, setActiveCards] = useState<Set<string>>(new Set());

  // ── Carga e sincronização ────────────────────────────────────────────────

  const fetchProgramacaoData = useCallback(
    async (showToast = false, silent = false) => {
      try {
        if (!silent) setLoading(true);
        setError(null);

        const response = await fetch("/api/programacao");
        if (!response.ok) {
          throw new Error(`Erro ao buscar dados: ${response.statusText}`);
        }

        setData(await response.json());
        if (showToast) toast.success("Dados atualizados com sucesso!");
      } catch (err) {
        console.error("Erro ao buscar dados de programação:", err);
        const message = err instanceof Error ? err.message : "Erro desconhecido";
        setError(message);
        if (showToast) toast.error(`Erro ao atualizar: ${message}`);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // Só os negócios ganhos: ~15s, contra ~2min da reconciliação completa.
      // É tudo que este board mostra.
      const syncResponse = await fetch("/api/ghl/sync-won-deals", {
        method: "POST",
      });
      if (!syncResponse.ok) {
        const detalhe = await syncResponse
          .json()
          .then((corpo) => corpo?.error)
          .catch(() => null);
        throw new Error(detalhe || `Falha ao sincronizar (${syncResponse.status})`);
      }
      await fetchProgramacaoData(true);
    } catch (err) {
      console.error("Error syncing data:", err);
      // Mostra o motivo que o servidor deu, em vez de um texto fixo que
      // esconde 403 de permissão, 503 de leitura e erro do GHL sob a mesma frase.
      toast.error(
        err instanceof Error ? err.message : "Erro ao sincronizar dados",
      );
      setRefreshing(false);
    }
  };

  /**
   * Estado liga/desliga dos cards, lido SEMPRE restrito aos deals que estão no
   * board. Ler a tabela inteira não funciona: ela guarda o histórico de todo
   * deal que já passou pela programação (2.050 linhas hoje) e o PostgREST corta
   * a resposta em 1.000 — os deals de fora dessa fatia voltavam como
   * "desligado", ficavam cinza e sumiam da Média de Pares/dia.
   *
   * O `.in()` vai na URL, então os ids são consultados em lotes.
   */
  const syncCardStates = useCallback(async (dealIds: string[]) => {
    if (dealIds.length === 0) {
      setActiveCards(new Set());
      return;
    }

    try {
      const estadoPorDeal = new Map<string, boolean>();

      for (let i = 0; i < dealIds.length; i += CARD_STATE_BATCH_SIZE) {
        const lote = dealIds.slice(i, i + CARD_STATE_BATCH_SIZE);
        const { data: states, error: statesError } = await supabase
          .from("programacao_card_states")
          .select("deal_id, is_active")
          .in("deal_id", lote)
          .returns<{ deal_id: string; is_active: boolean }[]>();

        if (statesError) {
          console.error("Error loading card states:", statesError);
          return;
        }
        for (const state of states || []) {
          estadoPorDeal.set(state.deal_id, state.is_active);
        }
      }

      // Card novo entra ligado. ignoreDuplicates evita o 409 quando o efeito
      // roda em paralelo (Strict Mode / dados mudando).
      const novos = dealIds.filter((dealId) => !estadoPorDeal.has(dealId));
      if (novos.length > 0) {
        const { error: insertError } = await supabase
          .from("programacao_card_states")
          .upsert(
            novos.map((dealId) => ({ deal_id: dealId, is_active: true })) as any,
            { onConflict: "deal_id", ignoreDuplicates: true },
          );
        if (insertError) {
          console.error("Error inserting new card states:", insertError.message);
        }
        for (const dealId of novos) estadoPorDeal.set(dealId, true);
      }

      setActiveCards(
        new Set(
          Array.from(estadoPorDeal)
            .filter(([, ativo]) => ativo)
            .map(([dealId]) => dealId),
        ),
      );
    } catch (err) {
      console.error("Error syncing card states:", err);
    }
  }, []);

  useEffect(() => {
    fetchProgramacaoData();
  }, [fetchProgramacaoData]);

  // Realtime: o webhook do GHL (ou um sync manual) mexe no deals_cache e o board
  // se atualiza sozinho. Com debounce porque os syncs gravam centenas de linhas.
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const channel = supabase
      .channel("deals_cache_ghl_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "deals_cache",
          filter: "source_system=eq.ghl",
        },
        () => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(
            () => fetchProgramacaoData(false, true),
            1500,
          );
        },
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [fetchProgramacaoData]);

  // ── Preferências locais ──────────────────────────────────────────────────

  useEffect(() => {
    setIsHydrated(true);

    const savedSortBy = storage.getItem("programacao-sortBy");
    if (savedSortBy === "value" || savedSortBy === "title") {
      setSortBy(savedSortBy);
    }

    const savedSortDirection = storage.getItem("programacao-sortDirection");
    if (savedSortDirection === "asc" || savedSortDirection === "desc") {
      setSortDirection(savedSortDirection);
    }

    const savedTipoFilter = storage.getItem("programacao-tipoFilter");
    if (savedTipoFilter) {
      try {
        setTipoFilter(new Set(JSON.parse(savedTipoFilter)));
      } catch {
        storage.removeItem("programacao-tipoFilter");
      }
    }

    // Chave legada da antiga visibilidade de grupos: guardava ids de datas, que
    // apodreciam conforme o calendário andava e escondiam colunas novas.
    storage.removeItem("programacao-visibleGroups");
    storage.removeItem("programacao-visibleGroups", "local");

    const savedHeaderCollapsed = storage.getItem("programacao-headerCollapsed");
    if (savedHeaderCollapsed !== null) {
      setIsHeaderCollapsed(savedHeaderCollapsed === "true");
    }

    const savedZoomLevel = storage.getItem("programacao-zoomLevel");
    if (savedZoomLevel) setZoomLevel(Number(savedZoomLevel));
  }, []);

  useEffect(() => {
    if (isHydrated) storage.setItem("programacao-sortBy", sortBy);
  }, [sortBy, isHydrated]);

  useEffect(() => {
    if (isHydrated) storage.setItem("programacao-sortDirection", sortDirection);
  }, [sortDirection, isHydrated]);

  useEffect(() => {
    if (isHydrated) {
      storage.setItem(
        "programacao-tipoFilter",
        JSON.stringify(Array.from(tipoFilter)),
      );
    }
  }, [tipoFilter, isHydrated]);

  useEffect(() => {
    if (isHydrated) {
      storage.setItem("programacao-headerCollapsed", String(isHeaderCollapsed));
    }
  }, [isHeaderCollapsed, isHydrated]);

  useEffect(() => {
    if (isHydrated) storage.setItem("programacao-zoomLevel", String(zoomLevel));
  }, [zoomLevel, isHydrated]);

  useEffect(() => {
    if (!data) return;
    syncCardStates(
      data.groups.flatMap((group) => group.deals.map((deal) => deal.id)),
    );
  }, [data, syncCardStates]);

  const handleCardToggle = (dealId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setActiveCards((prev) => {
      const next = new Set(prev);
      const isActive = !next.has(dealId);
      if (isActive) next.add(dealId);
      else next.delete(dealId);

      supabase
        .from("programacao_card_states")
        .upsert({ deal_id: dealId, is_active: isActive } as any, {
          onConflict: "deal_id",
        })
        .then(({ error: upsertError }) => {
          if (upsertError) {
            console.error("Error saving active card:", upsertError);
          }
        });

      return next;
    });
  };

  // ── Montagem do board ────────────────────────────────────────────────────

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const { displayGroups, gruposFora } = useMemo<{
    displayGroups: BoardGroup[];
    gruposFora: Partial<Record<MotivoFora, BoardGroup>>;
  }>(() => {
    if (!data) return { displayGroups: [], gruposFora: {} };

    const matchesFilters = (deal: BoardDeal) => {
      if (tipoFilter.size > 0) {
        if (!deal.tipoPedido || !tipoFilter.has(deal.tipoPedido)) return false;
      }
      if (!normalizedSearch) return true;
      return [
        deal.title,
        deal.vendedor,
        deal.designer,
        deal.stageTitle,
        deal.dataEmbarque,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    };

    // Ordem dentro da coluna: primeiro o tipo (Evento na frente), depois o
    // critério escolhido no seletor. "Em atraso" mistura muitos dias, então lá
    // a data manda e o tipo desempata.
    const sortDeals = (deals: BoardDeal[], groupId: string) =>
      [...deals].sort((a, b) => {
        if (groupId === EM_ATRASO_GROUP_ID) {
          const dateA = parseDate(a.dataEmbarque)?.getTime() ?? Infinity;
          const dateB = parseDate(b.dataEmbarque)?.getTime() ?? Infinity;
          if (dateA !== dateB) {
            return sortDirection === "asc" ? dateA - dateB : dateB - dateA;
          }
        }

        const rankDiff =
          getTipoPedidoRank(a.tipoPedido) - getTipoPedidoRank(b.tipoPedido);
        if (rankDiff !== 0) return rankDiff;

        const comparison =
          sortBy === "title"
            ? a.title.localeCompare(b.title)
            : b.value - a.value;
        return sortDirection === "asc" ? comparison : -comparison;
      });

    const overdueDeals: BoardDeal[] = [];
    const remainingGroups: BoardGroup[] = [];
    const emConferencia: BoardDeal[] = [];
    const semData: BoardDeal[] = [];

    for (const group of data.groups) {
      const deals = group.deals.filter(matchesFilters);
      const agendaveis: BoardDeal[] = [];

      for (const deal of deals) {
        // Em conferência o cadastro ainda está sendo preenchido, então a data
        // é suposta. Deixá-lo numa coluna de dia faz o board prometer um
        // embarque que ninguém confirmou — e, se a data já venceu, joga os
        // pares dele na conta de "Em atraso" da fábrica.
        if (isDadosEmConferencia(deal.stageTitle)) {
          emConferencia.push(deal);
        } else if (group.id === SEM_DATA_GROUP_ID) {
          semData.push(deal);
        } else {
          agendaveis.push(deal);
        }
      }

      if (group.id === SEM_DATA_GROUP_ID) continue;

      const onTime: BoardDeal[] = [];
      for (const deal of agendaveis) {
        if (isOverdue(deal.dataEmbarque)) overdueDeals.push(deal);
        else onTime.push(deal);
      }

      if (onTime.length > 0) {
        remainingGroups.push({
          ...group,
          deals: sortDeals(onTime, group.id),
          dealsCount: onTime.length,
        });
      }
    }

    const groups: BoardGroup[] = [];
    if (overdueDeals.length > 0) {
      groups.push({
        id: EM_ATRASO_GROUP_ID,
        title: "Em atraso",
        dealsCount: overdueDeals.length,
        deals: sortDeals(overdueDeals, EM_ATRASO_GROUP_ID),
      });
    }
    groups.push(...remainingGroups);

    const fora: Partial<Record<MotivoFora, BoardGroup>> = {};
    if (emConferencia.length > 0) {
      fora["em-conferencia"] = {
        id: "em-conferencia",
        title: "Pagamento Confirmado/Completar Dados",
        dealsCount: emConferencia.length,
        deals: sortDeals(emConferencia, "em-conferencia"),
      };
    }
    if (semData.length > 0) {
      fora["sem-data"] = {
        id: SEM_DATA_GROUP_ID,
        title: "Sem data de embarque",
        dealsCount: semData.length,
        deals: sortDeals(semData, SEM_DATA_GROUP_ID),
      };
    }

    return { displayGroups: groups, gruposFora: fora };
  }, [data, normalizedSearch, tipoFilter, sortBy, sortDirection]);

  const grupoFora = foraAtivo ? gruposFora[foraAtivo] : undefined;
  const gruposVisiveis = grupoFora ? [grupoFora] : displayGroups;

  const displayTotalDeals = gruposVisiveis.reduce(
    (sum, group) => sum + group.deals.length,
    0,
  );
  const hasFilters = normalizedSearch.length > 0 || tipoFilter.size > 0;
  const cardWidth = (320 * zoomLevel) / 100;

  const handleDealClick = (deal: BoardDeal) => {
    setSelectedDeal(deal);
    setIsDealDialogOpen(true);
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      {!isHeaderCollapsed && (
        <>
          <div className="hud-v2-head flex-shrink-0">
            <div className="hud-v2-title">
              <div className="hud-v2-tile">
                <Clock />
              </div>
              <div>
                <h1>Programação</h1>
                <p className="hud-v2-sub">Pedidos ganhos até a produção</p>
              </div>
            </div>

            <div className="hud-group" role="group" aria-label="Ações da programação">
              <AveragePairsCalculator
                deals={
                  data?.groups
                    .flatMap((group) => group.deals)
                    .filter((deal) => !isDadosEmConferencia(deal.stageTitle)) || []
                }
                activeCards={activeCards}
              />
              <span className="hud-group-sep" aria-hidden />
              <RelatorioDialog titulo="Programação" endpoint="/api/programacao" />
              <span className="hud-group-sep" aria-hidden />
              <Link href="/expedicao">
                <PackageCheck />
                Expedição
              </Link>
              <span className="hud-group-sep" aria-hidden />
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing || loading}
              >
                <RefreshCw className={refreshing ? "animate-spin" : undefined} />
                {refreshing ? "Atualizando..." : "Atualizar"}
              </button>
            </div>
          </div>

          <div className="hud-panel hud-bar flex-shrink-0">
            <div className="hud-field">
              <span className="hud-field-label">Ordenar</span>
              <div className="hud-group">
                <button
                  type="button"
                  onClick={() =>
                    setSortDirection(sortDirection === "asc" ? "desc" : "asc")
                  }
                  title={
                    sortDirection === "asc"
                      ? "Ordem crescente"
                      : "Ordem decrescente"
                  }
                  aria-label={
                    sortDirection === "asc"
                      ? "Ordem crescente"
                      : "Ordem decrescente"
                  }
                >
                  {sortDirection === "asc" ? <ArrowUp /> : <ArrowDown />}
                </button>
                <span className="hud-group-sep" aria-hidden />
                <Select
                  value={sortBy}
                  onValueChange={(value) =>
                    setSortBy(value as "value" | "title")
                  }
                >
                  <SelectTrigger aria-label="Ordenar por">
                    <SelectValue placeholder="Ordenar por" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="value">Valor</SelectItem>
                    <SelectItem value="title">Título</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="hud-field">
              <span className="hud-field-label">Tipo do pedido</span>
              <TipoPedidoFilter
                variante="grupo"
                selected={tipoFilter}
                onChange={setTipoFilter}
                counts={data?.summary.porTipo}
              />
            </div>

            <ForaDoBoard
              variante="grupo"
              buckets={[
                {
                  motivo: "em-conferencia",
                  quantidade: gruposFora["em-conferencia"]?.dealsCount ?? 0,
                },
                {
                  motivo: "sem-data",
                  quantidade: gruposFora["sem-data"]?.dealsCount ?? 0,
                },
              ]}
              ativo={foraAtivo}
              onToggle={(motivo) =>
                setForaAtivo((atual) => (atual === motivo ? null : motivo))
              }
            />
          </div>

          {error && (
            <Alert variant="destructive" className="flex-shrink-0">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </>
      )}

      {loading ? (
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <Skeleton className="h-full w-full" />
        </div>
      ) : data && data.groups.length > 0 ? (
        <div className="hud-panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="hud-panel-head flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsHeaderCollapsed(!isHeaderCollapsed)}
              className="h-8 w-8"
              title={
                isHeaderCollapsed ? "Expandir cabeçalho" : "Recolher cabeçalho"
              }
            >
              {isHeaderCollapsed ? (
                <ChevronDown className="h-5 w-5" />
              ) : (
                <ChevronUp className="h-5 w-5" />
              )}
            </Button>
            <h2 className="text-lg font-bold tracking-tight">Data de embarque</h2>
            <span className="hud-chip">
              {displayTotalDeals} {displayTotalDeals === 1 ? "pedido" : "pedidos"}
              {hasFilters ? ` de ${data.summary.totalDeals}` : ""}
            </span>

            <div className="order-last flex w-full items-center gap-2 sm:order-none sm:ml-auto sm:w-auto">
              <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar pedido, vendedor, designer..."
                  className="h-9 rounded-[10px] bg-muted pl-8 pr-8"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    title="Limpar busca"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="hud-group" role="group" aria-label="Zoom do quadro">
                <button
                  type="button"
                  onClick={() => setZoomLevel((prev) => Math.max(prev - 10, 50))}
                  disabled={zoomLevel <= 50}
                  title="Diminuir zoom (mostrar mais cards)"
                  aria-label="Diminuir zoom"
                >
                  <ZoomOut />
                </button>
                <span className="hud-group-val">{zoomLevel}%</span>
                <button
                  type="button"
                  onClick={() =>
                    setZoomLevel((prev) => Math.min(prev + 10, 100))
                  }
                  disabled={zoomLevel >= 100}
                  title="Aumentar zoom"
                  aria-label="Aumentar zoom"
                >
                  <ZoomIn />
                </button>
              </div>
            </div>
          </div>

          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
            {gruposVisiveis.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
                <Search className="h-8 w-8 opacity-50" />
                <p>Nenhum deal encontrado com os filtros atuais</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchTerm("");
                    setTipoFilter(new Set());
                  }}
                >
                  Limpar filtros
                </Button>
              </div>
            ) : (
              <BoardColumns
                groups={gruposVisiveis}
                cardWidth={cardWidth}
                renderCard={(deal) => (
                  <DealCard
                    key={deal.id}
                    deal={deal}
                    isActive={activeCards.has(deal.id)}
                    showValue={false}
                    onToggle={handleCardToggle}
                    onClick={handleDealClick}
                  />
                )}
              />
            )}
          </div>
        </div>
      ) : (
        <Alert className="flex-shrink-0">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Nenhum pedido em produção no momento. Clique em &quot;Atualizar&quot;
            para sincronizar com o GHL.
          </AlertDescription>
        </Alert>
      )}

      <DealDialog
        deal={selectedDeal}
        open={isDealDialogOpen}
        showValue={false}
        onOpenChange={setIsDealDialogOpen}
      />
    </div>
  );
}
