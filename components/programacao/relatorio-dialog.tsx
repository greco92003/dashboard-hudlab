"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Eye,
  FileDown,
  FileText,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BoardDeal } from "@/lib/programacao/board-types";
import { formatDate } from "@/lib/programacao/board-dates";
import {
  AGRUPAMENTO_ROTULOS,
  agruparDeals,
  celulasDoDeal,
  colunasDoRelatorio,
  estaEmAtraso,
  etapaDoDeal,
  etapaForaDoPadrao,
  filtrarDeals,
  opcoesDe,
  paresDoDeal,
  rotuloDoGrupo,
  tipoDoDeal,
  totaisDoRelatorio,
  vendedorDoDeal,
  type RelatorioAgrupamento,
} from "@/lib/programacao/relatorio";
import { cn } from "@/lib/utils";

type Props = {
  /** Nome da tela, usado no título do PDF. */
  titulo: string;
  /**
   * Endpoint do board. O relatório recarrega ao abrir para não depender da
   * janela de dias ou dos filtros que a tela aplicou.
   */
  endpoint: string;
  mostrarValor?: boolean;
  /** Tamanho do botão: a /producao usa botões grandes de tela de toque. */
  grande?: boolean;
};

type Opcao = { valor: string; quantidade: number };
type Passo = "filtros" | "previa";

/** Logo da HUD Lab como data URL; sem logo o relatório sai do mesmo jeito. */
async function carregarLogo() {
  try {
    const resposta = await fetch("/logo-hudlab-box.png");
    if (!resposta.ok) return null;
    const blob = await resposta.blob();
    return await new Promise<string | null>((resolve) => {
      const leitor = new FileReader();
      leitor.onload = () => resolve(typeof leitor.result === "string" ? leitor.result : null);
      leitor.onerror = () => resolve(null);
      leitor.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function GrupoDeOpcoes({
  titulo,
  opcoes,
  selecionadas,
  onChange,
  colunas = 1,
  className,
}: {
  titulo: string;
  opcoes: Opcao[];
  selecionadas: Set<string>;
  onChange: (proximas: Set<string>) => void;
  colunas?: 1 | 2;
  className?: string;
}) {
  const todas = opcoes.length > 0 && opcoes.every((opcao) => selecionadas.has(opcao.valor));
  // Sem rolagem própria: listas roláveis dentro de um pop-up que também rola
  // prendiam a roda do mouse e a barra invadia a coluna vizinha. Quem rola é o
  // pop-up inteiro.
  return (
    <div role="group" aria-label={titulo} className={cn("min-w-0 space-y-2 rounded-lg border p-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{titulo}</span>
        <button
          type="button"
          className="shrink-0 text-xs text-primary hover:underline"
          onClick={() => onChange(todas ? new Set() : new Set(opcoes.map((opcao) => opcao.valor)))}
        >
          {todas ? "Limpar" : "Marcar todos"}
        </button>
      </div>
      <div className={cn("grid gap-x-4 gap-y-1.5", colunas === 2 && "sm:grid-cols-2")}>
        {opcoes.map((opcao) => {
          const id = `${titulo}-${opcao.valor}`;
          return (
            <div key={opcao.valor} className="flex min-w-0 items-start gap-2">
              <Checkbox
                id={id}
                className="mt-0.5"
                checked={selecionadas.has(opcao.valor)}
                onCheckedChange={(marcado) => {
                  const proximas = new Set(selecionadas);
                  if (marcado === true) proximas.add(opcao.valor);
                  else proximas.delete(opcao.valor);
                  onChange(proximas);
                }}
              />
              <Label htmlFor={id} className="min-w-0 flex-1 cursor-pointer break-words text-sm font-normal leading-5">
                {opcao.valor}
              </Label>
              <span className="shrink-0 text-xs leading-5 text-muted-foreground">{opcao.quantidade}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RelatorioDialog({ titulo, endpoint, mostrarValor = false, grande = false }: Props) {
  const [aberto, setAberto] = useState(false);
  const [passo, setPasso] = useState<Passo>("filtros");
  const [carregando, setCarregando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [deals, setDeals] = useState<BoardDeal[]>([]);
  const [embarqueDe, setEmbarqueDe] = useState("");
  const [embarqueAte, setEmbarqueAte] = useState("");
  const [incluirSemData, setIncluirSemData] = useState(true);
  const [soAtrasados, setSoAtrasados] = useState(false);
  const [etapas, setEtapas] = useState<Set<string>>(new Set());
  const [tipos, setTipos] = useState<Set<string>>(new Set());
  const [vendedores, setVendedores] = useState<Set<string>>(new Set());
  const [agrupamento, setAgrupamento] = useState<RelatorioAgrupamento>("embarque");

  useEffect(() => {
    if (!aberto) return;
    let ativo = true;
    setPasso("filtros");
    setCarregando(true);
    fetch(endpoint, { cache: "no-store" })
      .then(async (resposta) => {
        const corpo = await resposta.json();
        if (!resposta.ok) throw new Error(corpo.error || "Falha ao carregar os pedidos.");
        const unicos = new Map<string, BoardDeal>();
        for (const grupo of (corpo.groups ?? []) as Array<{ deals: BoardDeal[] }>) {
          for (const deal of grupo.deals) unicos.set(deal.id, deal);
        }
        const lista = [...unicos.values()];
        if (!ativo) return;
        setDeals(lista);
        setEtapas(new Set(lista.map(etapaDoDeal).filter((etapa) => !etapaForaDoPadrao(etapa))));
        setTipos(new Set(lista.map(tipoDoDeal)));
        setVendedores(new Set(lista.map(vendedorDoDeal)));
      })
      .catch((erro) => ativo && toast.error(erro instanceof Error ? erro.message : "Falha ao carregar os pedidos."))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [aberto, endpoint]);

  const opcoes = useMemo(() => ({
    etapas: opcoesDe(deals, etapaDoDeal),
    tipos: opcoesDe(deals, tipoDoDeal),
    vendedores: opcoesDe(deals, vendedorDoDeal),
  }), [deals]);

  const totalAtrasados = useMemo(() => deals.filter(estaEmAtraso).length, [deals]);

  const filtrados = useMemo(
    () => filtrarDeals(deals, { embarqueDe, embarqueAte, incluirSemData, etapas, tipos, vendedores, soAtrasados }),
    [deals, embarqueDe, embarqueAte, incluirSemData, etapas, tipos, vendedores, soAtrasados],
  );
  const pares = filtrados.reduce((soma, deal) => soma + paresDoDeal(deal), 0);
  const periodoInvalido = Boolean(embarqueDe && embarqueAte && embarqueDe > embarqueAte);

  // Tudo que a prévia e o PDF precisam sai daqui, uma vez só.
  const tituloFinal = soAtrasados ? `${titulo} · em atraso` : titulo;
  const layout = { mostrarValor, mostrarAtraso: soAtrasados };
  const colunas = colunasDoRelatorio(layout);
  const grupos = useMemo(() => agruparDeals(filtrados, agrupamento), [filtrados, agrupamento]);

  const resumoSelecao = (nome: string, selecionadas: Set<string>, todas: Opcao[]) =>
    selecionadas.size === todas.length ? `${nome}: todos` : `${nome}: ${[...selecionadas].join(", ") || "nenhum"}`;

  const periodo = embarqueDe || embarqueAte
    ? `de ${embarqueDe ? formatDate(embarqueDe) : "início"} até ${embarqueAte ? formatDate(embarqueAte) : "hoje em diante"}`
    : "sem limite";

  const resumoFiltros = [
    [
      soAtrasados ? `Só pedidos em atraso (embarque antes de ${new Date().toLocaleDateString("pt-BR")})` : "",
      `Data de embarque: ${periodo}`,
      soAtrasados ? "" : incluirSemData ? "inclui pedidos sem data" : "sem os pedidos sem data",
      `Agrupado por: ${AGRUPAMENTO_ROTULOS[agrupamento].toLowerCase()}`,
    ].filter(Boolean).join(" · "),
    [
      resumoSelecao("Etapas", etapas, opcoes.etapas),
      resumoSelecao("Tipos", tipos, opcoes.tipos),
      resumoSelecao("Vendedores", vendedores, opcoes.vendedores),
    ].join(" · "),
  ];

  const exportar = async () => {
    setExportando(true);
    try {
      const [{ montarRelatorioPdf, nomeDoRelatorio }, logo] = await Promise.all([
        import("@/lib/programacao/relatorio-pdf"),
        carregarLogo(),
      ]);
      montarRelatorioPdf({
        titulo: tituloFinal,
        logo,
        grupos,
        agrupamento,
        mostrarValor,
        mostrarAtraso: soAtrasados,
        resumoFiltros,
      }).save(nomeDoRelatorio(tituloFinal));
      setAberto(false);
    } catch (erro) {
      console.error("Falha ao gerar o PDF do relatório:", erro);
      toast.error("Não consegui gerar o PDF. Tente de novo.");
    } finally {
      setExportando(false);
    }
  };

  const podeAvancar = !carregando && !periodoInvalido && filtrados.length > 0;

  return (
    <>
      <Button
        variant="outline"
        size={grande ? "default" : "sm"}
        className={cn(grande && "h-11 text-base")}
        onClick={() => setAberto(true)}
      >
        <FileText className={cn("mr-2", grande ? "h-5 w-5" : "h-4 w-4")} />
        Relatórios
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent
          className={cn(
            "flex max-h-[90vh] flex-col gap-4",
            passo === "previa" ? "sm:max-w-5xl" : "sm:max-w-2xl",
          )}
        >
          <DialogHeader>
            <DialogTitle>
              {passo === "previa" ? "Prévia" : "Relatório"} · {tituloFinal}
            </DialogTitle>
            <DialogDescription>
              {passo === "previa"
                ? "É exatamente o que vai sair no PDF."
                : "Escolha o período e os filtros, e confira antes de exportar."}
            </DialogDescription>
          </DialogHeader>

          {/* Só o miolo rola; título e botões ficam sempre à vista. */}
          <div className="-mx-6 min-h-0 flex-1 overflow-y-auto overscroll-contain px-6">
            {carregando ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando pedidos…
              </div>
            ) : passo === "filtros" ? (
              <div className="space-y-4">
                {/* Filtro rápido: um clique monta o recorte de atraso. */}
                <button
                  type="button"
                  aria-pressed={soAtrasados}
                  onClick={() => setSoAtrasados((valor) => !valor)}
                  disabled={totalAtrasados === 0}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                    soAtrasados
                      ? "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200"
                      : "hover:bg-muted/60",
                  )}
                >
                  <AlertTriangle
                    className={cn("h-5 w-5 shrink-0", soAtrasados ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">Só pedidos em atraso</span>
                    <span className="block text-xs opacity-80">
                      Embarque já passou · sem os em conferência e os já recebidos · adiciona a coluna de dias de atraso
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full border px-2 py-0.5 text-sm font-semibold tabular-nums">
                    {totalAtrasados}
                  </span>
                </button>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="relatorio-de">Embarque de</Label>
                    <Input id="relatorio-de" type="date" value={embarqueDe} onChange={(evento) => setEmbarqueDe(evento.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="relatorio-ate">Embarque até</Label>
                    <Input id="relatorio-ate" type="date" value={embarqueAte} onChange={(evento) => setEmbarqueAte(evento.target.value)} />
                  </div>
                  <div className="flex items-center gap-2 sm:col-span-2">
                    <Checkbox
                      id="relatorio-sem-data"
                      checked={soAtrasados ? false : incluirSemData}
                      disabled={soAtrasados}
                      onCheckedChange={(marcado) => setIncluirSemData(marcado === true)}
                    />
                    <Label
                      htmlFor="relatorio-sem-data"
                      className={cn("cursor-pointer text-sm font-normal", soAtrasados && "text-muted-foreground")}
                    >
                      Incluir pedidos sem data de embarque
                      {soAtrasados && " (sem data não tem como estar atrasado)"}
                    </Label>
                  </div>
                  {periodoInvalido && <p className="text-xs text-destructive sm:col-span-2">A data inicial é depois da data final.</p>}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <GrupoDeOpcoes titulo="Etapa" opcoes={opcoes.etapas} selecionadas={etapas} onChange={setEtapas} colunas={2} className="sm:col-span-2" />
                  <GrupoDeOpcoes titulo="Tipo de pedido" opcoes={opcoes.tipos} selecionadas={tipos} onChange={setTipos} />
                  <GrupoDeOpcoes titulo="Vendedor" opcoes={opcoes.vendedores} selecionadas={vendedores} onChange={setVendedores} />
                </div>

                <div className="space-y-1.5 sm:max-w-xs">
                  <Label>Agrupar por</Label>
                  <Select value={agrupamento} onValueChange={(valor) => setAgrupamento(valor as RelatorioAgrupamento)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(AGRUPAMENTO_ROTULOS) as RelatorioAgrupamento[]).map((chave) => (
                        <SelectItem key={chave} value={chave}>{AGRUPAMENTO_ROTULOS[chave]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <PreviaDoRelatorio
                titulo={tituloFinal}
                resumoFiltros={resumoFiltros}
                grupos={grupos}
                colunas={colunas}
                agrupamento={agrupamento}
                mostrarValor={mostrarValor}
              />
            )}
          </div>

          <DialogFooter className="items-center gap-2 border-t pt-4 sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {filtrados.length} pedido(s) · {pares} pares
            </p>
            {passo === "filtros" ? (
              <Button onClick={() => setPasso("previa")} disabled={!podeAvancar}>
                <Eye className="mr-2 h-4 w-4" /> Visualizar
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setPasso("filtros")} disabled={exportando}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Ajustar filtros
                </Button>
                <Button onClick={() => void exportar()} disabled={exportando || filtrados.length === 0}>
                  {exportando ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileDown className="mr-2 h-4 w-4" />
                  )}
                  Exportar PDF
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Prévia em HTML, e não o PDF embutido: PDF dentro de iframe não renderiza no
 * navegador do celular (Chrome no Android baixa o arquivo, Safari mostra só a
 * primeira página), e a /producao roda em celular. O conteúdo é o mesmo do PDF
 * porque as duas saídas montam colunas, células e totais pelas mesmas funções.
 */
function PreviaDoRelatorio({
  titulo,
  resumoFiltros,
  grupos,
  colunas,
  agrupamento,
  mostrarValor,
}: {
  titulo: string;
  resumoFiltros: string[];
  grupos: ReturnType<typeof agruparDeals>;
  colunas: ReturnType<typeof colunasDoRelatorio>;
  agrupamento: RelatorioAgrupamento;
  mostrarValor: boolean;
}) {
  return (
    <div className="space-y-4 rounded-lg border bg-background p-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-lg font-bold">Relatório · {titulo}</h3>
          <span className="text-xs text-muted-foreground">
            Gerado em {new Date().toLocaleString("pt-BR")}
          </span>
        </div>
        {resumoFiltros.map((linha) => (
          <p key={linha} className="text-xs text-muted-foreground">{linha}</p>
        ))}
        <p className="pt-1 text-sm font-semibold">{totaisDoRelatorio(grupos, mostrarValor)}</p>
      </div>

      {grupos.map((grupo) => (
        <div key={grupo.titulo} className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[640px] border-collapse text-xs">
            <thead>
              {agrupamento !== "nenhum" && (
                <tr>
                  <th colSpan={colunas.length} className="bg-muted px-2 py-1.5 text-left text-sm font-semibold">
                    {rotuloDoGrupo(grupo, mostrarValor)}
                  </th>
                </tr>
              )}
              <tr className="bg-muted/50">
                {colunas.map((coluna) => (
                  <th
                    key={coluna.chave}
                    className={cn("border-t px-2 py-1.5 font-semibold", coluna.direita ? "text-right" : "text-left")}
                  >
                    {coluna.rotulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grupo.deals.map((deal) => (
                <tr key={deal.id} className="border-t">
                  {celulasDoDeal(deal, colunas).map((celula, indice) => (
                    <td
                      key={colunas[indice].chave}
                      className={cn(
                        "px-2 py-1.5 align-top",
                        // Data, dias e números não quebram: "12 / dias" em duas
                        // linhas lia como dois valores.
                        ["embarque", "atraso", "pares", "valor"].includes(colunas[indice].chave) && "whitespace-nowrap",
                        colunas[indice].direita && "text-right tabular-nums",
                        colunas[indice].chave === "atraso" && celula !== "—" && "font-semibold text-red-700 dark:text-red-400",
                      )}
                    >
                      {celula}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
