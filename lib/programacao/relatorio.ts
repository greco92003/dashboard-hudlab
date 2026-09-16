import type { BoardDeal } from "./board-types";
import {
  formatDate,
  getDaysUntilShipping,
  isOverdue,
  toIsoDate,
} from "./board-dates";
import {
  getPhaseForStage,
  isDadosEmConferencia,
} from "../ghl/programacao-stages";

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
  /** Filtro rápido: só o que está atrasado, pelo mesmo critério do board. */
  soAtrasados?: boolean;
};

export const etapaDoDeal = (deal: BoardDeal) => deal.stageTitle?.trim() || SEM_ETAPA;
export const tipoDoDeal = (deal: BoardDeal) => deal.tipoPedido ?? SEM_TIPO;
export const vendedorDoDeal = (deal: BoardDeal) => deal.vendedor?.trim() || SEM_VENDEDOR;
export const paresDoDeal = (deal: BoardDeal) => parseInt(deal.quantidadePares || "0", 10) || 0;

export const moeda = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Mesmo critério da coluna "Em atraso" do board: tem data de embarque e ela já
 * passou. Ficam de fora o pedido em conferência — a data ainda é suposta, e a
 * equipe definiu que essa etapa não existe para a programação — e o já
 * recebido, que não está atrasado: chegou.
 */
export function estaEmAtraso(deal: BoardDeal) {
  if (isDadosEmConferencia(deal.stageTitle)) return false;
  if (getPhaseForStage(deal.stageTitle) === "concluido") return false;
  return isOverdue(deal.dataEmbarque);
}

/** Dias desde a data de embarque; 0 quando não está atrasado. */
export function diasDeAtraso(deal: BoardDeal) {
  const dias = getDaysUntilShipping(deal.dataEmbarque);
  return dias !== null && dias < 0 ? -dias : 0;
}

/**
 * Etapas que o relatório abre desmarcadas. Conferência porque não conta para a
 * programação; recebido porque o endpoint da Expedição traz o histórico
 * inteiro (mais de mil pedidos entregues) e, marcado por padrão, afogava o
 * relatório do que ainda está em andamento. Um clique marca de volta.
 */
export function etapaForaDoPadrao(etapa: string) {
  return isDadosEmConferencia(etapa) || getPhaseForStage(etapa) === "concluido";
}

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
    if (filtros.soAtrasados && !estaEmAtraso(deal)) return false;
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

// ── Layout compartilhado entre a prévia e o PDF ─────────────────────────────
// As duas saídas montam colunas e células daqui, para o que se vê na prévia
// ser exatamente o que sai no arquivo.

export type RelatorioColuna = {
  chave: "embarque" | "atraso" | "pedido" | "tipo" | "etapa" | "vendedor" | "pares" | "valor";
  rotulo: string;
  /** Largura em mm no PDF; sem largura, a coluna ocupa o que sobra. */
  largura?: number;
  direita?: boolean;
};

export type RelatorioLayout = { mostrarValor: boolean; mostrarAtraso: boolean };

export function colunasDoRelatorio({ mostrarValor, mostrarAtraso }: RelatorioLayout): RelatorioColuna[] {
  return [
    { chave: "embarque", rotulo: "Embarque", largura: 22 },
    ...(mostrarAtraso ? [{ chave: "atraso", rotulo: "Atraso", largura: 18, direita: true } as const] : []),
    { chave: "pedido", rotulo: "Pedido" },
    { chave: "tipo", rotulo: "Tipo", largura: 22 },
    { chave: "etapa", rotulo: "Etapa", largura: 45 },
    { chave: "vendedor", rotulo: "Vendedor", largura: 34 },
    { chave: "pares", rotulo: "Pares", largura: 16, direita: true },
    ...(mostrarValor ? [{ chave: "valor", rotulo: "Valor", largura: 28, direita: true } as const] : []),
  ];
}

export function celulasDoDeal(deal: BoardDeal, colunas: RelatorioColuna[]): string[] {
  const atraso = diasDeAtraso(deal);
  const valores: Record<RelatorioColuna["chave"], string> = {
    embarque: formatDate(deal.dataEmbarque) || "—",
    atraso: atraso ? `${atraso} ${atraso === 1 ? "dia" : "dias"}` : "—",
    pedido: deal.title,
    tipo: tipoDoDeal(deal),
    etapa: etapaDoDeal(deal),
    vendedor: vendedorDoDeal(deal),
    pares: String(paresDoDeal(deal)),
    valor: moeda((deal.value || 0) / 100),
  };
  return colunas.map((coluna) => valores[coluna.chave]);
}

export function rotuloDoGrupo(grupo: RelatorioGrupo, mostrarValor: boolean) {
  return `${grupo.titulo}  —  ${grupo.deals.length} pedido(s) · ${grupo.pares} pares${mostrarValor ? ` · ${moeda(grupo.valor)}` : ""}`;
}

export function totaisDoRelatorio(grupos: RelatorioGrupo[], mostrarValor: boolean) {
  const pedidos = grupos.reduce((soma, grupo) => soma + grupo.deals.length, 0);
  const pares = grupos.reduce((soma, grupo) => soma + grupo.pares, 0);
  const valor = grupos.reduce((soma, grupo) => soma + grupo.valor, 0);
  return [`${pedidos} pedido(s)`, `${pares} pares`, mostrarValor ? moeda(valor) : ""]
    .filter(Boolean)
    .join("   ·   ");
}
