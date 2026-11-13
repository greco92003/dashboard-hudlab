"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
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
  Columns3,
  Eye,
  List,
  RefreshCw,
  PackageCheck,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { ColunasPorDia, ListaPorDia, useMidia } from "@/components/producao/painel-pedidos";
import { RelatorioDialog } from "@/components/programacao/relatorio-dialog";
import { DealDialog } from "@/components/programacao/deal-dialog";
import {
  TipoPedidoFilter,
  type TipoFilterValue,
} from "@/components/programacao/tipo-pedido-filter";
import { getTipoPedidoRank } from "@/lib/ghl/programacao-stages";
import { parseDate } from "@/lib/programacao/board-dates";
import type { BoardDeal, BoardGroup } from "@/lib/programacao/board-types";
import { BarraDeFiltros, CabecalhoDaPagina, Campo, GrupoDeAcoes } from "@/components/hud/pagina";

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
      await fetchExpedicaoData(recebidosDias, true);
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

  // Colunas no computador, lista no celular e no tablet (como o Painel Produção);
  // os botões Colunas | Lista fixam a escolha neste aparelho.
  const [visao, setVisao] = useState<"auto" | "quadro" | "lista">("auto");
  const telaLarga = useMidia("(min-width: 1280px)");
  const modoQuadro = visao === "auto" ? telaLarga : visao === "quadro";
  useEffect(() => {
    const salva = storage.getItem("expedicao-visao");
    if (salva === "quadro" || salva === "lista") setVisao(salva);
  }, []);
  const mudarVisao = (nova: "quadro" | "lista") => {
    setVisao(nova);
    storage.setItem("expedicao-visao", nova);
  };

  // Lista: todas as etapas abertas, menos o histórico de recebidos.
  const abertosIniciais = displayGroups.filter((g) => g.id !== RECEBIDO_GROUP_ID).map((g) => g.id);

  const renderAcoes = (deal: BoardDeal) => (
    <Button variant="outline" className="h-10 w-full" onClick={() => handleDealClick(deal)}>
      <Eye className="h-4 w-4" />
      Ver detalhes
    </Button>
  );

  const handleDealClick = (deal: BoardDeal) => {
    setSelectedDeal(deal);
    setIsDealDialogOpen(true);
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      {!isHeaderCollapsed && (
        <>
          <CabecalhoDaPagina
            className="flex-shrink-0"
            icone={PackageCheck}
            titulo="Expedição"
            descricao="Depois da produção, até o cliente receber"
            acoes={
              <GrupoDeAcoes rotulo="Ações da expedição">
                {/* recebidosDias=0: o período do relatório pode ir além da janela da tela. */}
                <RelatorioDialog titulo="Expedição" endpoint="/api/expedicao?recebidosDias=0" mostrarValor />
                <Link href="/programacao">
                  <Clock />
                  Programação
                </Link>
                <button type="button" onClick={handleRefresh} disabled={refreshing || loading}>
                  <RefreshCw className={refreshing ? "animate-spin" : undefined} />
                  {refreshing ? "Atualizando..." : "Atualizar"}
                </button>
              </GrupoDeAcoes>
            }
          />

          <BarraDeFiltros className="flex-shrink-0">
            <Campo rotulo="Ordenar">
              <div className="hud-group">
                <button
                  type="button"
                  onClick={() => setSortDirection(sortDirection === "asc" ? "desc" : "asc")}
                  title={sortDirection === "asc" ? "Ordem crescente" : "Ordem decrescente"}
                  aria-label={sortDirection === "asc" ? "Ordem crescente" : "Ordem decrescente"}
                >
                  {sortDirection === "asc" ? <ArrowUp /> : <ArrowDown />}
                </button>
                <span className="hud-group-sep" aria-hidden />
                <Select value={sortBy} onValueChange={(value) => setSortBy(value as "date" | "value" | "title")}>
                  <SelectTrigger aria-label="Ordenar por">
                    <SelectValue placeholder="Ordenar por" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date">Data de Embarque</SelectItem>
                    <SelectItem value="value">Valor</SelectItem>
                    <SelectItem value="title">Título</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Campo>
            <Campo rotulo="Recebidos">
              <div className="hud-group" title="Recorta a coluna Recebido pela data de embarque">
                <Select value={recebidosDias} onValueChange={setRecebidosDias}>
                  <SelectTrigger aria-label="Janela dos recebidos">
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
            </Campo>
            <Campo rotulo="Tipo do pedido">
              <TipoPedidoFilter
                variante="grupo"
                selected={tipoFilter}
                onChange={setTipoFilter}
                counts={data?.summary.porTipo}
              />
            </Campo>
          </BarraDeFiltros>

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
        <div className="hud-panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="hud-panel-head flex-shrink-0">
            <div className="flex items-center gap-2">
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
              <h2 className="text-lg font-bold tracking-tight">Etapa</h2>
              <span className="hud-chip">{data.summary.emAndamento} em andamento</span>
              <span className="hud-chip">
                {displayTotalDeals} {displayTotalDeals === 1 ? "pedido" : "pedidos"}
                {hasFilters ? ` de ${data.summary.totalDeals}` : ""}
              </span>
            </div>

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

              <div className="hud-group" role="group" aria-label="Visualização">
                <button
                  type="button"
                  aria-pressed={modoQuadro}
                  onClick={() => mudarVisao("quadro")}
                  title="Colunas lado a lado"
                  aria-label="Ver em colunas"
                >
                  <Columns3 />
                </button>
                <button
                  type="button"
                  aria-pressed={!modoQuadro}
                  onClick={() => mudarVisao("lista")}
                  title="Lista que rola para baixo"
                  aria-label="Ver em lista"
                >
                  <List />
                </button>
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
                  onClick={() => setZoomLevel((prev) => Math.min(prev + 10, 100))}
                  disabled={zoomLevel >= 100}
                  title="Aumentar zoom"
                  aria-label="Aumentar zoom"
                >
                  <ZoomIn />
                </button>
              </div>
            </div>
          </div>

          <div className="min-h-0 min-w-0 flex-1 overflow-hidden" style={{ fontSize: `${zoomLevel}%` }}>
            {modoQuadro ? (
              <div className="h-full p-3">
                <ColunasPorDia
                  grupos={displayGroups}
                  grupoConcluidoId={RECEBIDO_GROUP_ID}
                  renderAcoes={renderAcoes}
                  mostrarValor
                  rotuloVazio="Nada nesta etapa"
                />
              </div>
            ) : (
              <div className="h-full overflow-y-auto p-3" style={{ "--prod-topo": "0px" } as CSSProperties}>
                <ListaPorDia
                  grupos={displayGroups}
                  grupoConcluidoId={RECEBIDO_GROUP_ID}
                  abertosIniciais={abertosIniciais}
                  renderAcoes={renderAcoes}
                  mostrarValor
                  rotuloVazio="Nada nesta etapa"
                />
              </div>
            )}
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
