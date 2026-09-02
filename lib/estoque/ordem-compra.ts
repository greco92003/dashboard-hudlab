/**
 * Ordens de compra de solado — tipos e regra pura.
 *
 * Separado de `ordem-compra-source.ts` porque a tela é componente cliente e
 * importa `OC_SITUACAO`: puxar o módulo de IO junto arrastaria o cliente do
 * Tiny e, com ele, `server-only`.
 *
 * As ordens são armazenadas no Tiny, operadas pelo dashboard.
 *
 * A OC vive no Tiny e não numa tabela nossa porque é lá que ela encontra a nota
 * fiscal: `GET /ordem-compra/{id}` devolve `notaFiscal` com o documento
 * vinculado. Esse vínculo é o que torna o abatimento exato — sem ele seria
 * preciso adivinhar de qual OC veio cada entrada.
 *
 * O que está "a caminho" é **itens da OC menos itens das notas vinculadas**. O
 * item da OC no Tiny não tem quantidade recebida, e entrega parcial é o caso
 * normal (a nota 17904 do INPU entregou 220 de 1.100), então a `situacao` da
 * OC sozinha não basta.
 */

import type { SoladoCor, SoladoItemDemanda } from "./solados";

/** Contato do INPU no Tiny — único fornecedor de solado hoje. */
export const FORNECEDOR_SOLADO_ID = 736255680;

/**
 * A listagem do Tiny filtra por NOME do fornecedor, não por id. "INPU" basta e
 * é estável; o resto do nome ("-IND NACIONAL DE POLIURETANOS LTDA") é o tipo de
 * coisa que muda numa alteração cadastral.
 */
export const FORNECEDOR_SOLADO_NOME = "INPU";

/** `situacao` da ordem de compra no Tiny. */
export const OC_SITUACAO = {
  emAberto: "0",
  atendido: "1",
  cancelado: "2",
  emAndamento: "3",
} as const;

export type OrdemCompraItem = {
  produtoId: number;
  descricao: string;
  cor: SoladoCor | null;
  numeracao: string | null;
  quantidade: number;
  preco: number;
  /** Pares desta linha já cobertos por nota vinculada. */
  recebido: number;
};

export type OrdemCompra = {
  id: number;
  numeroPedido: string | null;
  data: string | null;
  dataPrevista: string | null;
  situacao: string | null;
  fornecedor: string | null;
  notaFiscal: { id: number; numero: string; dataEmissao: string } | null;
  itens: OrdemCompraItem[];
};

/**
 * Pares pedidos e ainda não cobertos por nota, somados por cor × numeração.
 * É a coluna "a caminho" da tela.
 */
export function paresACaminho(ordens: OrdemCompra[]): SoladoItemDemanda[] {
  const acumulado = new Map<string, SoladoItemDemanda>();
  for (const ordem of ordens) {
    // Só cancelada sai fora. "Atendida" não serve de corte sozinha: o Tiny
    // marca a ordem como atendida ao vincular uma nota, mesmo que a entrega
    // tenha sido parcial. Quem responde o que ainda vem é
    // `quantidade - recebido`; se a ordem estiver de fato completa, a conta dá
    // zero por si.
    if (ordem.situacao === OC_SITUACAO.cancelado) continue;
    for (const item of ordem.itens) {
      if (!item.cor || !item.numeracao) continue;
      const faltando = item.quantidade - item.recebido;
      if (faltando <= 0) continue;
      const chave = `${item.cor}|${item.numeracao}`;
      const atual = acumulado.get(chave);
      if (atual) atual.pares += faltando;
      else
        acumulado.set(chave, {
          cor: item.cor,
          numeracao: item.numeracao,
          pares: faltando,
        });
    }
  }
  return [...acumulado.values()];
}

export type NovaOrdemCompra = {
  dataPrevista?: string | null;
  observacoes?: string | null;
  itens: Array<{ produtoId: number; quantidade: number; valor: number }>;
};
