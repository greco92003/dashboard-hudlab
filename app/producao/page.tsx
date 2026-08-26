"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useUserProfile } from "@/hooks/useUserProfile";
import {
  AlertCircle,
  ArrowLeft,
  Clock,
  Factory,
  PackageCheck,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  ForaDoBoard,
  type MotivoFora,
} from "@/components/programacao/fora-do-board";
import { BoardColumns } from "@/components/programacao/board-columns";
import { DealCard } from "@/components/programacao/deal-card";
import { ConcluirDialog } from "@/components/producao/concluir-dialog";
import {
  TipoPedidoFilter,
  type TipoFilterValue,
} from "@/components/programacao/tipo-pedido-filter";
import {
  getTipoPedidoRank,
  isDadosEmConferencia,
  isEtapaConcluivel,
} from "@/lib/ghl/programacao-stages";
import { isOverdue, parseDate } from "@/lib/programacao/board-dates";
import type { BoardDeal, BoardGroup } from "@/lib/programacao/board-types";

const SEM_DATA_GROUP_ID = "sem-data";
const EM_ATRASO_GROUP_ID = "em-atraso";
const RECEBIDO_GROUP_ID = "recebido";

type Aba = "programacao" | "expedicao";

interface BoardResposta {
  groups: BoardGroup[];
  summary: { totalDeals: number; porTipo?: Record<string, number> };
}

/**
 * Board de chão de fábrica.
 *
 * Tela cheia, sem menu e sem valores: a produção só precisa saber o que fazer e
 * quando embarca. A Programação é operável — o botão Concluir empurra o pedido
 * para a Expedição no GHL. A Expedição é só leitura, para acompanhar o embarque;
 * dali em diante quem movimenta é o escritório, dentro do CRM.
 */
export default function ProducaoPage() {
  const [aba, setAba] = useState<Aba>("programacao");
  const [dados, setDados] = useState<Record<Aba, BoardResposta | null>>({
    programacao: null,
    expedicao: null,
  });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<Set<TipoFilterValue>>(new Set());
  const [foraAtivo, setForaAtivo] = useState<MotivoFora | null>(null);
  // Só o que está de fato na máquina, escondendo fotolito, serigrafia e cadastro.
  const [soEmProducao, setSoEmProducao] = useState(false);
  const [dealParaConcluir, setDealParaConcluir] = useState<BoardDeal | null>(null);
  const { profile } = useUserProfile();

  // A tela não tem menu, de propósito. Quem é do escritório precisa de uma
  // saída; quem é da produção não — para ela esta é a única tela que existe.
  const mostrarVolta = Boolean(profile) && profile?.role !== "producao";

  const carregar = useCallback(async (silencioso = false) => {
    try {
      if (!silencioso) setCarregando(true);
      setErro(null);

      const [programacao, expedicao] = await Promise.all([
        fetch("/api/programacao").then((r) =>
          r.ok ? r.json() : Promise.reject(new Error(r.statusText)),
        ),
        fetch("/api/expedicao?recebidosDias=30").then((r) =>
          r.ok ? r.json() : Promise.reject(new Error(r.statusText)),
        ),
      ]);

      setDados({ programacao, expedicao });
    } catch (err) {
      console.error("Erro ao carregar boards da produção:", err);
      setErro(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // O board se atualiza sozinho quando o GHL mexe em qualquer negócio.
  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel("deals_cache_producao")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "deals_cache",
          filter: "source_system=eq.ghl",
        },
        () => {
          if (debounce) clearTimeout(debounce);
          debounce = setTimeout(() => carregar(true), 1500);
        },
      )
      .subscribe();

    return () => {
      if (debounce) clearTimeout(debounce);
      supabase.removeChannel(channel);
    };
  }, [carregar]);

  const buscaNormalizada = busca.trim().toLowerCase();

  const { grupos, gruposFora } = useMemo<{
    grupos: BoardGroup[];
    gruposFora: Partial<Record<MotivoFora, BoardGroup>>;
  }>(() => {
    const resposta = dados[aba];
    if (!resposta) return { grupos: [], gruposFora: {} };

    const combina = (deal: BoardDeal) => {
      // Mesmo critério do botão Concluir, para os dois nunca divergirem: o que
      // o filtro mostra é exatamente o que a produção consegue concluir.
      if (soEmProducao && !isEtapaConcluivel(deal.stageTitle)) return false;
      if (tipoFiltro.size > 0) {
        if (!deal.tipoPedido || !tipoFiltro.has(deal.tipoPedido)) return false;
      }
      if (!buscaNormalizada) return true;
      return [deal.title, deal.vendedor, deal.stageTitle, deal.dataEmbarque]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(buscaNormalizada);
    };

    // Evento na frente, sem tipo por último; depois, o embarque mais próximo.
    const ordenar = (deals: BoardDeal[]) =>
      [...deals].sort((a, b) => {
        const rank =
          getTipoPedidoRank(a.tipoPedido) - getTipoPedidoRank(b.tipoPedido);
        if (rank !== 0) return rank;
        const dataA = parseDate(a.dataEmbarque)?.getTime() ?? Infinity;
        const dataB = parseDate(b.dataEmbarque)?.getTime() ?? Infinity;
        return dataA - dataB;
      });

    if (aba === "expedicao") {
      const grupos = resposta.groups.map((grupo) => {
        const deals = ordenar(grupo.deals.filter(combina));
        return { ...grupo, deals, dealsCount: deals.length };
      });
      return { grupos, gruposFora: {} };
    }

    const atrasados: BoardDeal[] = [];
    const restantes: BoardGroup[] = [];
    const emConferencia: BoardDeal[] = [];
    const semData: BoardDeal[] = [];

    for (const grupo of resposta.groups) {
      const deals = grupo.deals.filter(combina);
      const agendaveis: BoardDeal[] = [];

      for (const deal of deals) {
        // Em conferência o cadastro ainda está sendo preenchido: a data é
        // suposta e não pode ocupar coluna de dia nem contar como atraso.
        if (isDadosEmConferencia(deal.stageTitle)) emConferencia.push(deal);
        else if (grupo.id === SEM_DATA_GROUP_ID) semData.push(deal);
        else agendaveis.push(deal);
      }

      if (grupo.id === SEM_DATA_GROUP_ID) continue;

      const noPrazo: BoardDeal[] = [];
      for (const deal of agendaveis) {
        if (isOverdue(deal.dataEmbarque)) atrasados.push(deal);
        else noPrazo.push(deal);
      }
      if (noPrazo.length > 0) {
        restantes.push({
          ...grupo,
          deals: ordenar(noPrazo),
          dealsCount: noPrazo.length,
        });
      }
    }

    const resultado: BoardGroup[] = [];
    if (atrasados.length > 0) {
      resultado.push({
        id: EM_ATRASO_GROUP_ID,
        title: "Em atraso",
        dealsCount: atrasados.length,
        deals: ordenar(atrasados),
      });
    }
    resultado.push(...restantes);

    const fora: Partial<Record<MotivoFora, BoardGroup>> = {};
    if (emConferencia.length > 0) {
      fora["em-conferencia"] = {
        id: "em-conferencia",
        title: "Conferir Pgto/Completar Dados",
        dealsCount: emConferencia.length,
        deals: ordenar(emConferencia),
      };
    }
    if (semData.length > 0) {
      fora["sem-data"] = {
        id: SEM_DATA_GROUP_ID,
        title: "Sem data de embarque",
        dealsCount: semData.length,
        deals: ordenar(semData),
      };
    }

    return { grupos: resultado, gruposFora: fora };
  }, [dados, aba, buscaNormalizada, tipoFiltro, soEmProducao]);

  // Contagem do filtro: quantos cards da aba Produção estão numa etapa de máquina.
  const emProducaoCount = useMemo(
    () =>
      (dados.programacao?.groups ?? []).reduce(
        (soma, grupo) =>
          soma + grupo.deals.filter((d) => isEtapaConcluivel(d.stageTitle)).length,
        0,
      ),
    [dados.programacao],
  );

  const grupoFora = foraAtivo ? gruposFora[foraAtivo] : undefined;
  const gruposVisiveis = grupoFora ? [grupoFora] : grupos;

  const totalVisivel = gruposVisiveis.reduce(
    (soma, g) => soma + g.deals.length,
    0,
  );

  const botaoAba = (valor: Aba, rotulo: string, icone: React.ReactNode) => (
    <button
      type="button"
      onClick={() => setAba(valor)}
      className={cn(
        "flex items-center gap-2 rounded-lg px-4 py-2.5 text-base font-semibold transition-colors",
        aba === valor
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/70",
      )}
    >
      {icone}
      {rotulo}
    </button>
  );

  return (
    <div className="flex h-dvh min-w-0 flex-col gap-3 p-3">
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
        {botaoAba("programacao", "Produção", <Clock className="h-5 w-5" />)}
        {botaoAba("expedicao", "Expedição", <PackageCheck className="h-5 w-5" />)}

        <div className="relative ml-auto w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar pedido..."
            className="h-11 pl-10 pr-10 text-base"
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted"
              title="Limpar busca"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        <Badge variant="outline" className="h-11 px-3 text-base">
          {totalVisivel}
        </Badge>

        <Button
          variant="outline"
          onClick={() => carregar()}
          disabled={carregando}
          className="h-11"
          title="Atualizar"
        >
          <RefreshCw className={cn("h-5 w-5", carregando && "animate-spin")} />
        </Button>

        {mostrarVolta && (
          <Button asChild variant="ghost" className="h-11">
            <Link href="/programacao">
              <ArrowLeft className="mr-2 h-5 w-5" />
              Dashboard
            </Link>
          </Button>
        )}
      </div>

      <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
        {aba === "programacao" && (
          <>
            <Button
              type="button"
              variant={soEmProducao ? "default" : "outline"}
              onClick={() => setSoEmProducao((v) => !v)}
              className="h-11 gap-2 text-base font-semibold"
              title="Mostrar só o que está na máquina agora"
            >
              <Factory className="h-5 w-5" />
              Em produção
              <span className="opacity-70">{emProducaoCount}</span>
            </Button>
            <div className="h-7 w-px bg-border" aria-hidden="true" />
          </>
        )}

        <TipoPedidoFilter
          selected={tipoFiltro}
          onChange={setTipoFiltro}
          counts={dados[aba]?.summary.porTipo}
          tamanho="grande"
        />
      </div>

      <ForaDoBoard
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
        tamanho="grande"
      />

      {erro && (
        <Alert variant="destructive" className="flex-shrink-0">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      {aba === "expedicao" && (
        <p className="flex-shrink-0 text-sm text-muted-foreground">
          Acompanhamento apenas — daqui em diante quem movimenta é o escritório.
        </p>
      )}

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg border">
        {carregando ? (
          <Skeleton className="h-full w-full" />
        ) : gruposVisiveis.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
            <Search className="h-8 w-8 opacity-50" />
            <p className="text-lg">Nada por aqui.</p>
            {(busca || tipoFiltro.size > 0 || soEmProducao) && (
              <Button
                variant="outline"
                className="h-11"
                onClick={() => {
                  setBusca("");
                  setTipoFiltro(new Set());
                  setSoEmProducao(false);
                }}
              >
                Limpar filtros
              </Button>
            )}
          </div>
        ) : (
          <BoardColumns
            groups={gruposVisiveis}
            cardWidth={340}
            emptyLabel="Nada nesta etapa"
            renderCard={(deal, grupo) => (
              <DealCard
                key={deal.id}
                deal={deal}
                showValue={false}
                concluido={grupo.id === RECEBIDO_GROUP_ID}
                footer={
                  aba === "programacao" && isEtapaConcluivel(deal.stageTitle) ? (
                    <Button
                      className="h-12 w-full text-base font-semibold"
                      onClick={() => setDealParaConcluir(deal)}
                    >
                      <PackageCheck className="mr-2 h-5 w-5" />
                      Concluir
                    </Button>
                  ) : undefined
                }
              />
            )}
          />
        )}
      </div>

      <ConcluirDialog
        deal={dealParaConcluir}
        open={dealParaConcluir !== null}
        onOpenChange={(aberto) => !aberto && setDealParaConcluir(null)}
        onConcluido={() => carregar(true)}
      />
    </div>
  );
}
