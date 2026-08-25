"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { SidebarTrigger } from "@/components/ui/sidebar";
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
import { BoardColumns } from "@/components/programacao/board-columns";
import { DealCard } from "@/components/programacao/deal-card";
import { DealDialog } from "@/components/programacao/deal-dialog";
import {
  TipoPedidoFilter,
  type TipoFilterValue,
} from "@/components/programacao/tipo-pedido-filter";
import { getTipoPedidoRank } from "@/lib/ghl/programacao-stages";
import { parseDate } from "@/lib/programacao/board-dates";
import type { BoardDeal, BoardGroup } from "@/lib/programacao/board-types";

const RECEBIDO_GROUP_ID = "recebido";

/**
 * Janelas da coluna histórica de recebidos, medidas pela DATA DE EMBARQUE.
 * Não dá para medir por data de atualização: a migração do ActiveCampaign para
 * o GHL reescreveu esses timestamps em bloco e todo o histórico passaria por
 * recente.
 */
const JANELAS_RECEBIDOS = [
  { value: "30", label: "Embarque 30d" },
  { value: "90", label: "Embarque 90d" },
  { value: "0", label: "Todos" },
];

interface ExpedicaoData {
  success: boolean;
  message: string;
  summary: {
    totalDeals: number;
    emAndamento: number;
    recebidos: number;
    recebidosDias: number;
    totalValue: number;
    totalGroups: number;
    totalPares: number;
    porTipo: Record<string, number>;
  };
  groups: BoardGroup[];
}

export default function ExpedicaoPage() {
  const [data, setData] = useState<ExpedicaoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<"date" | "value" | "title">("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedDeal, setSelectedDeal] = useState<BoardDeal | null>(null);
  const [isDealDialogOpen, setIsDealDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [tipoFilter, setTipoFilter] = useState<Set<TipoFilterValue>>(new Set());
  const [recebidosDias, setRecebidosDias] = useState("30");
  const [isHydrated, setIsHydrated] = useState(false);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100);

  // ── Carga e sincronização ────────────────────────────────────────────────

  const fetchExpedicaoData = useCallback(
    async (dias: string, showToast = false, silent = false) => {
      try {
        if (!silent) setLoading(true);
        setError(null);

        const response = await fetch(`/api/expedicao?recebidosDias=${dias}`);
        if (!response.ok) {
          throw new Error(`Erro ao buscar dados: ${response.statusText}`);
        }

        setData(await response.json());
        if (showToast) toast.success("Dados atualizados com sucesso!");
      } catch (err) {
        console.error("Erro ao buscar dados de expedição:", err);
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
      // Reconciliação completa do GHL -> deals_cache (mesma rota usada pelo cron).
      const syncResponse = await fetch("/api/ghl/sync-deals", {
        method: "POST",
      });
      if (!syncResponse.ok) throw new Error("Failed to sync data");
      await fetchExpedicaoData(recebidosDias, true);
    } catch (err) {
      console.error("Error syncing data:", err);
      toast.error("Erro ao sincronizar dados");
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchExpedicaoData(recebidosDias);
  }, [fetchExpedicaoData, recebidosDias]);

  // Realtime: o webhook do GHL (ou um sync manual) mexe no deals_cache e o board
  // se atualiza sozinho. Com debounce porque os syncs gravam centenas de linhas.
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const channel = supabase
      .channel("deals_cache_expedicao_changes")
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
            () => fetchExpedicaoData(recebidosDias, false, true),
            1500,
          );
        },
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [fetchExpedicaoData, recebidosDias]);

  // ── Preferências locais ──────────────────────────────────────────────────

  useEffect(() => {
    setIsHydrated(true);

    const savedSortBy = storage.getItem("expedicao-sortBy");
    if (savedSortBy === "date" || savedSortBy === "value" || savedSortBy === "title") {
      setSortBy(savedSortBy);
    }

    const savedSortDirection = storage.getItem("expedicao-sortDirection");
    if (savedSortDirection === "asc" || savedSortDirection === "desc") {
      setSortDirection(savedSortDirection);
    }

    const savedTipoFilter = storage.getItem("expedicao-tipoFilter");
    if (savedTipoFilter) {
      try {
        setTipoFilter(new Set(JSON.parse(savedTipoFilter)));
      } catch {
        storage.removeItem("expedicao-tipoFilter");
      }
    }

    const savedDias = storage.getItem("expedicao-recebidosDias");
    if (savedDias && JANELAS_RECEBIDOS.some((j) => j.value === savedDias)) {
      setRecebidosDias(savedDias);
    }

    const savedHeaderCollapsed = storage.getItem("expedicao-headerCollapsed");
    if (savedHeaderCollapsed !== null) {
      setIsHeaderCollapsed(savedHeaderCollapsed === "true");
    }

    const savedZoomLevel = storage.getItem("expedicao-zoomLevel");
    if (savedZoomLevel) setZoomLevel(Number(savedZoomLevel));
  }, []);

  useEffect(() => {
    if (isHydrated) storage.setItem("expedicao-sortBy", sortBy);
  }, [sortBy, isHydrated]);

  useEffect(() => {
    if (isHydrated) storage.setItem("expedicao-sortDirection", sortDirection);
  }, [sortDirection, isHydrated]);

  useEffect(() => {
    if (isHydrated) {
      storage.setItem(
        "expedicao-tipoFilter",
        JSON.stringify(Array.from(tipoFilter)),
      );
    }
  }, [tipoFilter, isHydrated]);

  useEffect(() => {
    if (isHydrated) storage.setItem("expedicao-recebidosDias", recebidosDias);
  }, [recebidosDias, isHydrated]);

  useEffect(() => {
    if (isHydrated) {
      storage.setItem("expedicao-headerCollapsed", String(isHeaderCollapsed));
    }
  }, [isHeaderCollapsed, isHydrated]);

  useEffect(() => {
    if (isHydrated) storage.setItem("expedicao-zoomLevel", String(zoomLevel));
  }, [zoomLevel, isHydrated]);

  // ── Montagem do board ────────────────────────────────────────────────────

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const displayGroups = useMemo<BoardGroup[]>(() => {
    if (!data) return [];

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

    // Evento na frente aqui também: é o pedido cuja data não pode escorregar.
    const sortDeals = (deals: BoardDeal[]) =>
      [...deals].sort((a, b) => {
        const rankDiff =
          getTipoPedidoRank(a.tipoPedido) - getTipoPedidoRank(b.tipoPedido);
        if (rankDiff !== 0) return rankDiff;

        let comparison = 0;
        if (sortBy === "date") {
          const dateA = parseDate(a.dataEmbarque)?.getTime() ?? Infinity;
          const dateB = parseDate(b.dataEmbarque)?.getTime() ?? Infinity;
          comparison = dateA - dateB;
        } else if (sortBy === "title") {
          comparison = a.title.localeCompare(b.title);
        } else {
          comparison = b.value - a.value;
        }
        return sortDirection === "asc" ? comparison : -comparison;
      });

    return data.groups.map((group) => {
      const deals = sortDeals(group.deals.filter(matchesFilters));
      return { ...group, deals, dealsCount: deals.length };
    });
  }, [data, normalizedSearch, tipoFilter, sortBy, sortDirection]);

  const displayTotalDeals = displayGroups.reduce(
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
          <div className="flex flex-shrink-0 items-center gap-3">
            <PackageCheck className="h-6 w-6" />
            <h1 className="text-xl font-bold sm:text-2xl">Expedição</h1>
            <span className="hidden text-sm text-muted-foreground sm:inline">
              Depois da produção, até o cliente receber
            </span>
          </div>

          <div className="flex flex-shrink-0 flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setSortDirection(sortDirection === "asc" ? "desc" : "asc")
                  }
                  className="h-8 w-8"
                  title={
                    sortDirection === "asc"
                      ? "Ordem crescente"
                      : "Ordem decrescente"
                  }
                >
                  {sortDirection === "asc" ? (
                    <ArrowUp className="h-4 w-4" />
                  ) : (
                    <ArrowDown className="h-4 w-4" />
                  )}
                </Button>
                <Select
                  value={sortBy}
                  onValueChange={(value) =>
                    setSortBy(value as "date" | "value" | "title")
                  }
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Ordenar por" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date">Data de Embarque</SelectItem>
                    <SelectItem value="value">Valor</SelectItem>
                    <SelectItem value="title">Título</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className="whitespace-nowrap text-sm text-muted-foreground"
                  title="Recorta a coluna Recebido pela data de embarque"
                >
                  Recebidos:
                </span>
                <Select value={recebidosDias} onValueChange={setRecebidosDias}>
                  <SelectTrigger className="w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {JANELAS_RECEBIDOS.map((janela) => (
                      <SelectItem key={janela.value} value={janela.value}>
                        {janela.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex w-full gap-2 sm:w-auto">
              <Button asChild variant="ghost" size="sm">
                <Link href="/programacao">
                  <Clock className="mr-2 h-4 w-4" />
                  Programação
                </Link>
              </Button>
              <Button
                onClick={handleRefresh}
                disabled={refreshing || loading}
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                />
                {refreshing ? "Atualizando..." : "Atualizar"}
              </Button>
            </div>
          </div>

          <TipoPedidoFilter
            selected={tipoFilter}
            onChange={setTipoFilter}
            counts={data?.summary.porTipo}
          />

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
      ) : data ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
          <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
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
              <h2 className="text-xl font-bold">Etapa</h2>
            </div>

            <div className="relative order-last w-full sm:order-none sm:w-auto sm:max-w-xs sm:flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar deal, vendedor, designer..."
                className="h-9 pl-8 pr-8"
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

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-md border p-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setZoomLevel((prev) => Math.max(prev - 10, 50))}
                  disabled={zoomLevel <= 50}
                  className="h-7 w-7"
                  title="Diminuir zoom (mostrar mais cards)"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="min-w-[3rem] px-2 text-center text-xs font-medium">
                  {zoomLevel}%
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setZoomLevel((prev) => Math.min(prev + 10, 100))
                  }
                  disabled={zoomLevel >= 100}
                  className="h-7 w-7"
                  title="Aumentar zoom"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </div>
              <Badge variant="outline">
                {data.summary.emAndamento} em andamento
              </Badge>
              <Badge variant="outline">
                {displayTotalDeals} {displayTotalDeals === 1 ? "deal" : "deals"}
                {hasFilters ? ` de ${data.summary.totalDeals}` : ""}
              </Badge>
            </div>
          </div>

          <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg border border-white bg-transparent">
            <BoardColumns
              groups={displayGroups}
              cardWidth={cardWidth}
              emptyLabel="Nada nesta etapa"
              renderCard={(deal, group) => (
                <DealCard
                  key={deal.id}
                  deal={deal}
                  concluido={group.id === RECEBIDO_GROUP_ID}
                  onClick={handleDealClick}
                />
              )}
            />
          </div>
        </div>
      ) : (
        <Alert className="flex-shrink-0">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Nenhum dado disponível. Clique em &quot;Atualizar&quot; para
            sincronizar com o GHL.
          </AlertDescription>
        </Alert>
      )}

      <DealDialog
        deal={selectedDeal}
        open={isDealDialogOpen}
        onOpenChange={setIsDealDialogOpen}
      />
    </div>
  );
}
