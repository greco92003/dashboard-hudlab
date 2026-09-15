/**
 * Ordens de compra de solado — tipos e regra pura.
 *
 * Separado de `ordem-compra-source.ts` porque a tela é componente cliente e
 * importa `OC_SITUACAO`: puxar o módulo de IO junto arrastaria o cliente do
 * Tiny e, com ele, `server-only`.
 *
 * As ordens são armazenadas no Tiny, operadas pelo dashboard.
 *
 * **Não dá para saber, pelo Tiny, quanto cada ordem já recebeu.** O item da OC
 * não tem quantidade recebida, e ao aplicar uma nota o Tiny DESMEMBRA a ordem:
 * reduz a original para o saldo em aberto e gera uma filha com o que entrou. A
 * nota fica apontando para a mãe e os itens recebidos vão para a filha, então
 * as duas metades nunca se encontram.
 *
 * Por isso a conta é feita no agregado, por produto:
 *
 *     a caminho = total pedido em todas as ordens − total recebido nas notas
 *
 * Isso é imune ao desmembramento: a filha duplicada sempre vem acompanhada da
 * nota que a gerou, uma soma e a outra subtrai, e o líquido fica certo sozinho.
 * O preço é não saber o detalhe POR ORDEM — e a tela deixou de afirmar isso.
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

export type NotaEntrada = {
  id: number;
  numero: string | null;
  /** "AAAA-MM-DD". */
  dataEmissao: string;
  itens: Array<{ produtoId: number; quantidade: number }>;
};

/** Uma numeração × cor: quanto foi pedido, quanto chegou, quanto falta. */
export type ConsolidadoCompra = {
  produtoId: number;
  cor: SoladoCor;
  numeracao: string;
  pedido: number;
  recebido: number;
  faltando: number;
};

/**
 * Junta todas as ordens e todas as notas do fornecedor numa linha por produto.
 *
 * Só a ordem CANCELADA fica de fora. "Atendida" e "em andamento" não servem de
 * corte: o Tiny usa os dois estados no desmembramento, e a filha que guarda o
 * material recebido nasce "em andamento" sem nota nenhuma. Quem responde o que
 * ainda vem é a subtração.
 *
 * `notas` já deve vir recortada pelo período válido — ver
 * `lerRecebimentosDoFornecedor`.
 */
export function consolidarCompras(
  ordens: OrdemCompra[],
  notas: NotaEntrada[],
): ConsolidadoCompra[] {
  const linhas = new Map<number, ConsolidadoCompra>();

  for (const ordem of ordens) {
    if (ordem.situacao === OC_SITUACAO.cancelado) continue;
    for (const item of ordem.itens) {
      if (!item.cor || !item.numeracao) continue;
      const atual = linhas.get(item.produtoId);
      if (atual) atual.pedido += item.quantidade;
      else
        linhas.set(item.produtoId, {
          produtoId: item.produtoId,
          cor: item.cor,
          numeracao: item.numeracao,
          pedido: item.quantidade,
          recebido: 0,
          faltando: 0,
        });
    }
  }

  for (const nota of notas) {
    for (const item of nota.itens) {
      // Nota com produto que nenhuma ordem pediu é entrada avulsa: o saldo do
      // Tiny já a registrou e aqui ela não tem o que abater.
      const linha = linhas.get(item.produtoId);
      if (linha) linha.recebido += item.quantidade;
    }
  }

  for (const linha of linhas.values()) {
    linha.faltando = Math.max(0, linha.pedido - linha.recebido);
  }
  return [...linhas.values()];
}

/**
 * Pares ainda por chegar, por cor × numeração. É a coluna "a caminho" da tela.
 */
export function paresACaminho(
  consolidado: ConsolidadoCompra[],
): SoladoItemDemanda[] {
  const acumulado = new Map<string, SoladoItemDemanda>();
  for (const linha of consolidado) {
    if (linha.faltando <= 0) continue;
    const chave = `${linha.cor}|${linha.numeracao}`;
    const atual = acumulado.get(chave);
    if (atual) atual.pares += linha.faltando;
    else
      acumulado.set(chave, {
        cor: linha.cor,
        numeracao: linha.numeracao,
        pares: linha.faltando,
      });
  }
  return [...acumulado.values()];
}

export type NovaOrdemCompra = {
  dataPrevista?: string | null;
  observacoes?: string | null;
  itens: Array<{ produtoId: number; quantidade: number; valor: number }>;
};
