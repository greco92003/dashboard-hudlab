import type { TipoPedido } from "@/lib/ghl/programacao-stages";

/**
 * Card exibido pelos boards /programacao e /expedicao. As duas telas leem as
 * mesmas colunas do deals_cache; o que muda é o filtro de etapa e o agrupamento.
 *
 * Fica fora de lib/ghl/board-deals.ts (que é "server-only") para poder ser
 * importado também pelos componentes de cliente.
 */
export interface BoardDeal {
  id: string;
  title: string;
  /** Em centavos, como o deals_cache guarda. */
  value: number;
  currency: string;
  stageTitle: string | null;
  quantidadePares: string | null;
  vendedor: string | null;
  designer: string | null;
  /** dd/mm/aaaa vindo do GHL. */
  dataEmbarque: string | null;
  tipoPedido: TipoPedido | null;
  atualizadoEm: string | null;
}

export interface BoardGroup {
  id: string;
  title: string;
  dealsCount: number;
  deals: BoardDeal[];
}
