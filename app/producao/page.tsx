"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CalendarOff,
  ClipboardList,
  Clock,
  Factory,
  FileText,
  MoreHorizontal,
  PackageCheck,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/lib/supabase";
import { useUserProfile } from "@/hooks/useUserProfile";
import { cn } from "@/lib/utils";
import { type MotivoFora } from "@/components/programacao/fora-do-board";
import { RelatorioDialog } from "@/components/programacao/relatorio-dialog";
import { ConcluirDialog } from "@/components/producao/concluir-dialog";
import {
  AcoesPedido,
  ColunasPorDia,
  ListaPorDia,
  useMidia,
} from "@/components/producao/painel-pedidos";
import { type TipoFilterValue } from "@/components/programacao/tipo-pedido-filter";
import {
  getTipoPedidoRank,
  isDadosEmConferencia,
  isEtapaConcluivel,
  TIPO_PEDIDO_ORDER,
  type TipoPedido,
} from "@/lib/ghl/programacao-stages";
import { isOverdue, parseDate } from "@/lib/programacao/board-dates";
import { ehHoje } from "@/lib/producao/dias";
import type { BoardDeal, BoardGroup } from "@/lib/programacao/board-types";

const SEM_DATA_GROUP_ID = "sem-data";
const EM_ATRASO_GROUP_ID = "em-atraso";
const RECEBIDO_GROUP_ID = "recebido";

type Aba = "programacao" | "expedicao";

/** Lista (celular e tablet) ou colunas por dia (computador e TV). */
type Visao = "auto" | "lista" | "quadro";
const CHAVE_VISAO = "producao-visao";

const TOM_DO_TIPO: Record<TipoPedido, string> = {
  Evento: "tone-violet",
  Amostra: "tone-sky",
  Pedido: "tone-slate",
  Reposição: "tone-cyan",
};

/** O que fica fora das colunas de dia, e por quê (ver ForaDoBoard). */
const FORA_DO_BOARD: Array<{
  motivo: MotivoFora;
  rotulo: string;
  dica: string;
  tom: string;
  icone: typeof CalendarOff;
}> = [
  {
    motivo: "em-conferencia",
    rotulo: "Em conferência",
    dica: "Cadastro ainda sendo completado: a data é suposta",
    tom: "tone-slate",
    icone: ClipboardList,
  },
  {
    motivo: "sem-data",
    rotulo: "Sem data",
    dica: "Pedidos sem data de embarque",
    tom: "tone-pink",
    icone: CalendarOff,
  },
];

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
 *
 * Layout (13/11/2026): um pedido por linha, que abre no toque. No celular e no
 * tablet a lista é por dia e rola para baixo; no computador e na TV as mesmas
 * linhas ficam em colunas por dia. A escolha é pela largura da tela, e o "⋯"
 * deixa fixar uma das duas neste aparelho.
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
  const [relatorioAberto, setRelatorioAberto] = useState(false);
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [visao, setVisao] = useState<Visao>("auto");
  const telaLarga = useMidia("(min-width: 1280px)");
  const modo = visao === "auto" ? (telaLarga ? "quadro" : "lista") : visao;

  // A escolha de visualização vale para este aparelho (a TV e o celular diferem).
  useEffect(() => {
    try {
      const salva = window.localStorage.getItem(CHAVE_VISAO);
      if (salva === "lista" || salva === "quadro" || salva === "auto") setVisao(salva);
    } catch {
      // sem armazenamento: fica na automática
    }
  }, []);
  const mudarVisao = (nova: Visao) => {
    setVisao(nova);
    try {
      window.localStorage.setItem(CHAVE_VISAO, nova);
    } catch {
      // sem armazenamento: vale só nesta visita
    }
  };
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
        title: "Pagamento Confirmado/Completar Dados",
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
  const gruposVisiveis = useMemo(() => (grupoFora ? [grupoFora] : grupos), [grupoFora, grupos]);

  const totalVisivel = gruposVisiveis.reduce(
    (soma, g) => soma + g.deals.length,
    0,
  );

  const trocarAba = (valor: Aba) => {
    setAba(valor);
    setForaAtivo(null);
  };
  const alternarTipo = (tipo: TipoFilterValue) =>
    setTipoFiltro((atual) => {
      const novo = new Set(atual);
      if (novo.has(tipo)) novo.delete(tipo);
      else novo.add(tipo);
      return novo;
    });
  const temFiltro = Boolean(busca) || tipoFiltro.size > 0 || soEmProducao || foraAtivo !== null;
  const limparFiltros = () => {
    setBusca("");
    setTipoFiltro(new Set());
    setSoEmProducao(false);
    setForaAtivo(null);
  };

  // Lista: abre de cara só o atraso e o dia de hoje (ou o grupo "fora do board"
  // escolhido); na Expedição, todas as etapas menos o histórico de recebidos.
  const abertosIniciais = useMemo(() => {
    if (grupoFora) return [grupoFora.id];
    if (aba === "expedicao") {
      return gruposVisiveis.filter((g) => g.id !== RECEBIDO_GROUP_ID).map((g) => g.id);
    }
    const ids = gruposVisiveis
      .filter((g) => g.id === EM_ATRASO_GROUP_ID || ehHoje(g.title))
      .map((g) => g.id);
    return ids.length > 0 ? ids : gruposVisiveis.slice(0, 1).map((g) => g.id);
  }, [aba, grupoFora, gruposVisiveis]);

  const renderAcoes = (deal: BoardDeal, grande: boolean) =>
    aba === "programacao" && isEtapaConcluivel(deal.stageTitle) ? (
      <AcoesPedido deal={deal} grande={grande} onConcluir={setDealParaConcluir} />
    ) : null;

  const contagemPorTipo = dados[aba]?.summary.porTipo;
  const campoBusca = (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar pedido, vendedor, etapa..."
        className="h-10 rounded-[10px] bg-muted pl-9 pr-9 text-base"
        autoFocus={buscaAberta}
      />
      {busca && (
        <button
          type="button"
          onClick={() => setBusca("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-accent"
          title="Limpar busca"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );

  return (
    <div className={cn("prod-raiz flex min-w-0 flex-col", modo === "quadro" ? "h-dvh" : "min-h-dvh")}>
      <header
        className={cn(
          "z-20 flex flex-shrink-0 flex-col gap-2.5 px-3 pb-2.5 pt-3 md:px-5 md:pt-4",
          modo === "lista" && "sticky top-0 border-b bg-background/85 backdrop-blur-md",
        )}
      >
        <div className="flex items-center gap-2">
          <div className="hud-group" role="group" aria-label="Quadro">
            <button type="button" aria-pressed={aba === "programacao"} onClick={() => trocarAba("programacao")}>
              <Clock />
              Produção
            </button>
            <button type="button" aria-pressed={aba === "expedicao"} onClick={() => trocarAba("expedicao")}>
              <PackageCheck />
              Expedição
            </button>
          </div>

          <div className="hidden max-w-md flex-1 md:flex">{campoBusca}</div>
          <div className="flex-1" />

          <span className="hidden md:inline-flex">
            <span className="hud-chip h-8 px-3 text-sm">
              {totalVisivel} {totalVisivel === 1 ? "pedido" : "pedidos"}
            </span>
          </span>

          <div className="hud-group" role="group" aria-label="Ações">
            <button
              type="button"
              className="hud-so-pequena"
              aria-label="Buscar"
              aria-pressed={buscaAberta || Boolean(busca)}
              onClick={() => setBuscaAberta((v) => !v)}
            >
              <Search />
            </button>
            <button type="button" onClick={() => carregar()} disabled={carregando} aria-label="Atualizar" title="Atualizar">
              <RefreshCw className={carregando ? "animate-spin" : undefined} />
            </button>
            <span className="hud-group-sep hidden md:block" aria-hidden />
            <button type="button" className="hud-so-grande" onClick={() => setRelatorioAberto(true)}>
              <FileText />
              Relatórios
            </button>
            <span className="hud-group-sep hidden md:block" aria-hidden />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="Mais opções" title="Mais opções">
                  <MoreHorizontal />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem className="md:hidden" onSelect={() => setRelatorioAberto(true)}>
                  <FileText />
                  Relatórios
                </DropdownMenuItem>
                <DropdownMenuSeparator className="md:hidden" />
                <DropdownMenuLabel>Visualização</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={visao} onValueChange={(v) => mudarVisao(v as Visao)}>
                  <DropdownMenuRadioItem value="auto">Automática (pelo tamanho da tela)</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="quadro">Colunas por dia</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="lista">Lista</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                {mostrarVolta && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/programacao">
                        <ArrowLeft />
                        Voltar ao Dashboard
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {(buscaAberta || busca) && <div className="flex md:hidden">{campoBusca}</div>}

        <div className="hud-chips-linha" role="group" aria-label="Filtros">
          {aba === "programacao" && (
            <button
              type="button"
              className="hud-chip-filtro"
              aria-pressed={soEmProducao}
              onClick={() => setSoEmProducao((v) => !v)}
              title="Mostrar só o que está na máquina agora"
            >
              <Factory className="h-4 w-4" />
              Na máquina <span className="hud-n">{emProducaoCount}</span>
            </button>
          )}
          {TIPO_PEDIDO_ORDER.map((tipo) => (
            <button
              key={tipo}
              type="button"
              className={cn("hud-chip-filtro", TOM_DO_TIPO[tipo])}
              aria-pressed={tipoFiltro.has(tipo)}
              onClick={() => alternarTipo(tipo)}
            >
              {tipo} <span className="hud-n">{contagemPorTipo?.[tipo] ?? 0}</span>
            </button>
          ))}
          {aba === "programacao" &&
            FORA_DO_BOARD.filter((f) => (gruposFora[f.motivo]?.dealsCount ?? 0) > 0).map((f) => (
              <button
                key={f.motivo}
                type="button"
                className={cn("hud-chip-filtro", f.tom)}
                aria-pressed={foraAtivo === f.motivo}
                onClick={() => setForaAtivo((atual) => (atual === f.motivo ? null : f.motivo))}
                title={foraAtivo === f.motivo ? "Toque de novo para voltar ao quadro" : f.dica}
              >
                <f.icone className="h-4 w-4" />
                {f.rotulo} <span className="hud-n">{gruposFora[f.motivo]?.dealsCount}</span>
              </button>
            ))}
          {temFiltro && (
            <button type="button" className="hud-chip-filtro" onClick={limparFiltros}>
              <X className="h-4 w-4" />
              Limpar
            </button>
          )}
        </div>

        {aba === "expedicao" && (
          <p className="text-xs text-muted-foreground">
            Só acompanhamento: daqui em diante quem movimenta é o escritório.
          </p>
        )}
      </header>

      <main className={cn("min-w-0 px-3 pb-4 pt-3 md:px-5", modo === "quadro" && "flex min-h-0 flex-1 flex-col")}>
        {erro && (
          <Alert variant="destructive" className="mb-3 flex-shrink-0">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        )}

        {carregando && !dados[aba] ? (
          <Skeleton className={modo === "quadro" ? "h-full w-full" : "h-96 w-full"} />
        ) : gruposVisiveis.length === 0 ? (
          <div className="hud-panel flex flex-col items-center justify-center gap-3 p-10 text-center text-muted-foreground">
            <Search className="h-8 w-8 opacity-50" />
            <p className="text-lg">Nada por aqui.</p>
            {temFiltro && (
              <Button variant="outline" className="h-11" onClick={limparFiltros}>
                Limpar filtros
              </Button>
            )}
          </div>
        ) : modo === "quadro" ? (
          <ColunasPorDia grupos={gruposVisiveis} grupoConcluidoId={RECEBIDO_GROUP_ID} renderAcoes={renderAcoes} />
        ) : (
          <ListaPorDia
            key={`${aba}-${foraAtivo ?? ""}`}
            grupos={gruposVisiveis}
            grupoConcluidoId={RECEBIDO_GROUP_ID}
            abertosIniciais={abertosIniciais}
            renderAcoes={renderAcoes}
          />
        )}
      </main>

      {/* A produção não vê valores; o relatório segue a aba aberta. */}
      <RelatorioDialog
        key={aba}
        titulo={aba === "programacao" ? "Produção" : "Expedição"}
        endpoint={aba === "programacao" ? "/api/programacao" : "/api/expedicao?recebidosDias=0"}
        grande
        semBotao
        aberto={relatorioAberto}
        onAbertoChange={setRelatorioAberto}
      />

      <ConcluirDialog
        deal={dealParaConcluir}
        open={dealParaConcluir !== null}
        onOpenChange={(aberto) => !aberto && setDealParaConcluir(null)}
        onConcluido={() => carregar(true)}
      />
    </div>
  );
}
