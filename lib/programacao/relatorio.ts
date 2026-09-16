import type { BoardDeal } from "./board-types";
import { formatDate, toIsoDate } from "./board-dates";

export const SEM_TIPO = "Sem tipo";
export const SEM_VENDEDOR = "Sem vendedor";
export const SEM_ETAPA = "Sem etapa";

export type RelatorioAgrupamento = "embarque" | "etapa" | "tipo" | "vendedor" | "nenhum";

export const AGRUPAMENTO_ROTULOS: Record<RelatorioAgrupamento, string> = {
  embarque: "Data de embarque",
  etapa: "Etapa",
  tipo: "Tipo de pedido",
  vendedor: "Vendedor",
  nenhum: "Sem agrupamento",
};

export type RelatorioFiltros = {
  /** aaaa-mm-dd; vazio = sem limite. Vale sobre a Data de Embarque. */
  embarqueDe: string;
  embarqueAte: string;
  incluirSemData: boolean;
  etapas: Set<string>;
  tipos: Set<string>;
  vendedores: Set<string>;
};

export const etapaDoDeal = (deal: BoardDeal) => deal.stageTitle?.trim() || SEM_ETAPA;
export const tipoDoDeal = (deal: BoardDeal) => deal.tipoPedido ?? SEM_TIPO;
export const vendedorDoDeal = (deal: BoardDeal) => deal.vendedor?.trim() || SEM_VENDEDOR;
export const paresDoDeal = (deal: BoardDeal) => parseInt(deal.quantidadePares || "0", 10) || 0;

/** Valores distintos com contagem, na ordem em que o relatório os lista. */
export function opcoesDe(deals: BoardDeal[], chave: (deal: BoardDeal) => string) {
  const contagem = new Map<string, number>();
  for (const deal of deals) contagem.set(chave(deal), (contagem.get(chave(deal)) ?? 0) + 1);
  return [...contagem.entries()]
    .map(([valor, quantidade]) => ({ valor, quantidade }))
    .sort((a, b) => a.valor.localeCompare(b.valor, "pt-BR"));
}

export function filtrarDeals(deals: BoardDeal[], filtros: RelatorioFiltros) {
  return deals.filter((deal) => {
    if (!filtros.etapas.has(etapaDoDeal(deal))) return false;
    if (!filtros.tipos.has(tipoDoDeal(deal))) return false;
    if (!filtros.vendedores.has(vendedorDoDeal(deal))) return false;
    const embarque = toIsoDate(deal.dataEmbarque);
    if (!embarque) return filtros.incluirSemData;
    if (filtros.embarqueDe && embarque < filtros.embarqueDe) return false;
    if (filtros.embarqueAte && embarque > filtros.embarqueAte) return false;
    return true;
  });
}

function compararPorEmbarque(a: BoardDeal, b: BoardDeal) {
  const dataA = toIsoDate(a.dataEmbarque) ?? "9999-99-99";
  const dataB = toIsoDate(b.dataEmbarque) ?? "9999-99-99";
  return dataA.localeCompare(dataB) || a.title.localeCompare(b.title, "pt-BR");
}

export type RelatorioGrupo = { titulo: string; deals: BoardDeal[]; pares: number; valor: number };

export function agruparDeals(deals: BoardDeal[], agrupamento: RelatorioAgrupamento): RelatorioGrupo[] {
  const ordenados = [...deals].sort(compararPorEmbarque);
  const chave: (deal: BoardDeal) => string = {
    embarque: (deal: BoardDeal) => toIsoDate(deal.dataEmbarque) ?? "",
    etapa: etapaDoDeal,
    tipo: tipoDoDeal,
    vendedor: vendedorDoDeal,
    nenhum: () => "",
  }[agrupamento];

  const grupos = new Map<string, BoardDeal[]>();
  for (const deal of ordenados) {
    const valor = chave(deal);
    grupos.set(valor, [...(grupos.get(valor) ?? []), deal]);
  }

  return [...grupos.entries()]
    .sort(([a], [b]) => {
      if (agrupamento !== "embarque") return a.localeCompare(b, "pt-BR");
      if (!a) return 1;
      if (!b) return -1;
      return a.localeCompare(b);
    })
    .map(([valor, itens]) => ({
      titulo: agrupamento === "nenhum"
        ? "Todos os pedidos"
        : agrupamento === "embarque"
          ? valor ? `Embarque ${formatDate(valor)}` : "Sem data de embarque"
          : valor,
      deals: itens,
      pares: itens.reduce((soma, deal) => soma + paresDoDeal(deal), 0),
      valor: itens.reduce((soma, deal) => soma + (deal.value || 0), 0) / 100,
    }));
}
