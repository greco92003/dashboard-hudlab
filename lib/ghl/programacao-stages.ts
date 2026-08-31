/**
 * Fases operacionais do fluxo pós-venda no GHL.
 *
 * A /programacao acompanha o pedido até a produção terminar; a /expedicao pega
 * daí em diante (cobrança do saldo, fiscal, coleta, trânsito) até o cliente
 * receber. As duas telas leem o mesmo `deals_cache` e se dividem por etapa.
 *
 * O corte é feito por TÍTULO de etapa (`deals_cache.stage_title`) e não por id:
 * as etapas equivalentes vivem em três pipelines diferentes (Atendimento,
 * Fábrica de Mockups e Representantes) e o título é o que o time enxerga no CRM.
 */

export type ProgramacaoPhase = "programacao" | "expedicao" | "concluido";

/** minúsculas, sem acento e sem espaço duplicado — para comparar títulos do CRM. */
export function normalizeStageTitle(title: string | null | undefined): string {
  if (!title) return "";
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Etapas exibidas na /programacao: tudo que ainda depende da produção,
 * terminando em "Produção de Pedidos".
 */
export const PROGRAMACAO_STAGE_TITLES = [
  // Pipeline Atendimento
  "Pagamento Confirmado/Completar Dados",
  "Pagamento Confirmado",
  "Criar Arquivos Serigrafia",
  "Impressão de Fotolitos",
  "Cadastro ERP",
  "Cadastro Contas a Receber",
  "Produção de Amostras",
  "Produção de Pedidos",
  // Pipeline Fábrica de Mockups — pipeline transitório dos designers. Uma venda
  // já ganha volta para cá enquanto a arte é feita, e pode estar parada em
  // QUALQUER etapa dele, então o pipeline inteiro conta como programação.
  "Criar Mockup",
  "Mockup PRIORIDADE",
  "Alteração",
  "Alteração Prioridade",
  "Logo Inválido",
  "Fazendo Agora",
  "Mockup Pronto",
  "Alteração Pronta",
  "Criar Arquivo Serigrafia",
  "Arquivo Serigrafia Pronto",
  // Pipeline Representantes
  "Aprovar pedido com banco",
  "Cadastro de pedido",
  "Produção",
];

/** Etapas exibidas na /expedicao, na ordem em que viram colunas. */
export const EXPEDICAO_COLUMNS: Array<{
  id: string;
  title: string;
  stageTitles: string[];
}> = [
  {
    // Etapa criada nos pipelines Atendimento e Representantes para receber o
    // que a produção dá como concluído. É o único movimento que o dashboard
    // faz no CRM; daqui em diante quem toca é o escritório, dentro do GHL.
    // A coluna se chama "Na Expedição" porque o board inteiro já se chama
    // Expedição — o título da etapa no CRM continua sendo "Expedição".
    id: "expedicao",
    title: "Na Expedição",
    stageTitles: ["Expedição"],
  },
  { id: "cobrar-saldo", title: "Cobrar Saldo", stageTitles: ["Cobrar Saldo"] },
  {
    id: "aprovar-financeiro",
    title: "Aprovar Financeiro",
    stageTitles: ["Aprovar Financeiro Pedido Total"],
  },
  {
    id: "fiscal",
    title: "Fiscal",
    // Representantes chama a mesma etapa de "Fiscal/Cobrança".
    stageTitles: ["Fiscal", "Fiscal/Cobrança"],
  },
  { id: "coleta", title: "Coleta", stageTitles: ["Coleta"] },
  {
    id: "em-transito",
    title: "Em Trânsito",
    stageTitles: ["Em Trânsito (Link Rastreio)"],
  },
  {
    id: "recebido",
    title: "Recebido",
    stageTitles: ["Recebido Pedido", "Recebido Amostra"],
  },
];

/** Etapas finais: o cliente já recebeu. */
export const CONCLUIDO_STAGE_TITLES = ["Recebido Pedido", "Recebido Amostra"];

export const EXPEDICAO_STAGE_TITLES = EXPEDICAO_COLUMNS.flatMap(
  (column) => column.stageTitles,
);

const PROGRAMACAO_SET = new Set(
  PROGRAMACAO_STAGE_TITLES.map(normalizeStageTitle),
);
const EXPEDICAO_SET = new Set(EXPEDICAO_STAGE_TITLES.map(normalizeStageTitle));
const CONCLUIDO_SET = new Set(CONCLUIDO_STAGE_TITLES.map(normalizeStageTitle));

/**
 * Etapa desconhecida cai na /programacao de propósito: se alguém renomear ou
 * criar uma etapa no GHL, o deal aparece fora de lugar (visível, corrigível) em
 * vez de sumir das duas telas em silêncio.
 */
export function getPhaseForStage(
  stageTitle: string | null | undefined,
): ProgramacaoPhase {
  const normalized = normalizeStageTitle(stageTitle);
  if (CONCLUIDO_SET.has(normalized)) return "concluido";
  if (EXPEDICAO_SET.has(normalized)) return "expedicao";
  if (PROGRAMACAO_SET.has(normalized)) return "programacao";
  return "programacao";
}

export function getExpedicaoColumnId(
  stageTitle: string | null | undefined,
): string | null {
  const normalized = normalizeStageTitle(stageTitle);
  for (const column of EXPEDICAO_COLUMNS) {
    if (column.stageTitles.some((t) => normalizeStageTitle(t) === normalized)) {
      return column.id;
    }
  }
  return null;
}

/**
 * Etapas em que a produção pode dar o pedido como concluído. É o único
 * movimento que o dashboard faz no CRM; tudo depois disso é o escritório,
 * dentro do GHL.
 */
export const CONCLUIVEL_STAGE_TITLES = [
  "Produção de Pedidos",
  "Produção de Amostras",
  "Produção", // pipeline Representantes
];

/** Destino do botão Concluir, nos pipelines Atendimento e Representantes. */
export const EXPEDICAO_STAGE_TITLE = "Expedição";

/**
 * Etapa onde o cadastro ainda está sendo completado — é ela que existe para
 * preencher data de embarque, quantidade de pares e o resto. Negócio incompleto
 * ali é o estado normal da etapa, não erro; e como os dados ainda não são
 * confiáveis, esses pedidos ficam fora do cálculo de capacidade.
 */
export const DADOS_EM_CONFERENCIA_STAGE_TITLE = "Pagamento Confirmado/Completar Dados";

const CONCLUIVEL_SET = new Set(CONCLUIVEL_STAGE_TITLES.map(normalizeStageTitle));

export function isEtapaConcluivel(
  stageTitle: string | null | undefined,
): boolean {
  return CONCLUIVEL_SET.has(normalizeStageTitle(stageTitle));
}

export function isDadosEmConferencia(
  stageTitle: string | null | undefined,
): boolean {
  return (
    normalizeStageTitle(stageTitle) ===
    normalizeStageTitle(DADOS_EM_CONFERENCIA_STAGE_TITLE)
  );
}

// ── Tipo do Pedido ──────────────────────────────────────────────────────────
// Campo customizado de oportunidade no GHL (opportunity.tipo_do_pedido).
// A ordem abaixo é a ordem de prioridade na tela: Evento primeiro.

export const TIPO_PEDIDO_ORDER = [
  "Evento",
  "Amostra",
  "Pedido",
  "Reposição",
] as const;

export type TipoPedido = (typeof TIPO_PEDIDO_ORDER)[number];

const TIPO_PEDIDO_BY_NORMALIZED = new Map<string, TipoPedido>(
  TIPO_PEDIDO_ORDER.map((tipo) => [normalizeStageTitle(tipo), tipo]),
);

/** Devolve o valor canônico do campo, ou null quando ainda não foi preenchido. */
export function normalizeTipoPedido(
  value: string | null | undefined,
): TipoPedido | null {
  return TIPO_PEDIDO_BY_NORMALIZED.get(normalizeStageTitle(value)) ?? null;
}

/** Índice de ordenação; sem tipo vai para o fim da coluna. */
export function getTipoPedidoRank(value: string | null | undefined): number {
  const tipo = normalizeTipoPedido(value);
  return tipo ? TIPO_PEDIDO_ORDER.indexOf(tipo) : TIPO_PEDIDO_ORDER.length;
}
