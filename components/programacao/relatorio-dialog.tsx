"use client";

import { useEffect, useMemo, useState } from "react";
import { FileDown, FileText, Loader2 } from "lucide-react";
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
  etapaDoDeal,
  filtrarDeals,
  opcoesDe,
  paresDoDeal,
  tipoDoDeal,
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
  const [carregando, setCarregando] = useState(false);
  const [deals, setDeals] = useState<BoardDeal[]>([]);
  const [embarqueDe, setEmbarqueDe] = useState("");
  const [embarqueAte, setEmbarqueAte] = useState("");
  const [incluirSemData, setIncluirSemData] = useState(true);
  const [etapas, setEtapas] = useState<Set<string>>(new Set());
  const [tipos, setTipos] = useState<Set<string>>(new Set());
  const [vendedores, setVendedores] = useState<Set<string>>(new Set());
  const [agrupamento, setAgrupamento] = useState<RelatorioAgrupamento>("embarque");

  useEffect(() => {
    if (!aberto) return;
    let ativo = true;
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
        setEtapas(new Set(lista.map(etapaDoDeal)));
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

  const filtrados = useMemo(
    () => filtrarDeals(deals, { embarqueDe, embarqueAte, incluirSemData, etapas, tipos, vendedores }),
    [deals, embarqueDe, embarqueAte, incluirSemData, etapas, tipos, vendedores],
  );
  const pares = filtrados.reduce((soma, deal) => soma + paresDoDeal(deal), 0);
  const periodoInvalido = Boolean(embarqueDe && embarqueAte && embarqueDe > embarqueAte);

  const resumoSelecao = (nome: string, selecionadas: Set<string>, todas: Opcao[]) =>
    selecionadas.size === todas.length ? `${nome}: todos` : `${nome}: ${[...selecionadas].join(", ") || "nenhum"}`;

  const exportar = async () => {
    const [{ montarRelatorioPdf, nomeDoRelatorio }, logo] = await Promise.all([
      import("@/lib/programacao/relatorio-pdf"),
      carregarLogo(),
    ]);
    const periodo = embarqueDe || embarqueAte
      ? `de ${embarqueDe ? formatDate(embarqueDe) : "início"} até ${embarqueAte ? formatDate(embarqueAte) : "hoje em diante"}`
      : "sem limite";
    montarRelatorioPdf({
      titulo,
      logo,
      grupos: agruparDeals(filtrados, agrupamento),
      agrupamento,
      mostrarValor,
      resumoFiltros: [
        `Data de embarque: ${periodo}${incluirSemData ? " · inclui pedidos sem data" : " · sem os pedidos sem data"} · Agrupado por: ${AGRUPAMENTO_ROTULOS[agrupamento].toLowerCase()}`,
        [
          resumoSelecao("Etapas", etapas, opcoes.etapas),
          resumoSelecao("Tipos", tipos, opcoes.tipos),
          resumoSelecao("Vendedores", vendedores, opcoes.vendedores),
        ].join(" · "),
      ],
    }).save(nomeDoRelatorio(titulo));
    setAberto(false);
  };

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
        <DialogContent className="flex max-h-[90vh] flex-col gap-4 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Relatório · {titulo}</DialogTitle>
            <DialogDescription>Escolha o período e os filtros. O PDF lista os pedidos que sobrarem.</DialogDescription>
          </DialogHeader>

          {/* Só o miolo rola; título e botão de exportar ficam sempre à vista. */}
          <div className="-mx-6 min-h-0 flex-1 overflow-y-auto overscroll-contain px-6">
          {carregando ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando pedidos…
            </div>
          ) : (
            <div className="space-y-4">
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
                  <Checkbox id="relatorio-sem-data" checked={incluirSemData} onCheckedChange={(marcado) => setIncluirSemData(marcado === true)} />
                  <Label htmlFor="relatorio-sem-data" className="cursor-pointer text-sm font-normal">Incluir pedidos sem data de embarque</Label>
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
          )}
          </div>

          <DialogFooter className="items-center gap-2 border-t pt-4 sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {filtrados.length} pedido(s) · {pares} pares
            </p>
            <Button onClick={() => void exportar()} disabled={carregando || periodoInvalido || filtrados.length === 0}>
              <FileDown className="mr-2 h-4 w-4" /> Exportar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
