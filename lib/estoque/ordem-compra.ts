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

export type NotaEntrada = {
  id: number;
  numero: string | null;
  /** "AAAA-MM-DD". */
  dataEmissao: string;
  itens: Array<{ produtoId: number; quantidade: number }>;
};

/**
 * Distribui o que as notas de entrada trouxeram entre as ordens abertas,
 * **da mais antiga para a mais nova**.
 *
 * O desenho original lia `ordem-compra.notaFiscal`, apostando que o Tiny
 * amarraria a nota à OC. O campo nunca preencheu — numa OC criada por API não
 * há como amarrar uma nota de entrada avulsa — e a primeira entrega parcial de
 * verdade (nota 017905, 85 pares) apareceu contando duas vezes: já no saldo do
 * Tiny e ainda como "a caminho". Aquele campo também é singular, então nem
 * preenchido à mão aguentaria: a segunda nota apagaria a primeira.
 *
 * Aqui não há vínculo nenhum a manter. O casamento é por `produtoId`, que é o
 * que a nota e a OC têm em comum — a descrição não serve, o fornecedor emite
 * "SOLADO MICRO MC180 PRETO 42" para o nosso "SOLA SLIDE - PRETO 42/43".
 *
 * **A nota só abate ordem que já existia quando ela chegou.** Sem esse corte a
 * nota 017903 (17/08, 1.050 pares — remessa antiga, já absorvida na contagem
 * física) abateria a OC 2 (criada em 19/08) e apagaria 1.050 pares de "a
 * caminho" que são reais.
 */
export function aplicarRecebimentos(
  ordens: OrdemCompra[],
  notas: NotaEntrada[],
): OrdemCompra[] {
  const saida = ordens.map((ordem) => ({
    ...ordem,
    itens: ordem.itens.map((item) => ({ ...item, recebido: 0 })),
  }));

  // Nota mais antiga primeiro: ela consome a ordem mais antiga.
  const cronologica = [...notas].sort((a, b) =>
    a.dataEmissao.localeCompare(b.dataEmissao),
  );

  for (const nota of cronologica) {
    const candidatas = saida
      .filter(
        (ordem) =>
          ordem.situacao !== OC_SITUACAO.cancelado &&
          // Sem data não dá para saber se a ordem precede a nota; fica de fora
          // em vez de arriscar abater uma ordem que ainda nem existia.
          ordem.data !== null &&
          ordem.data <= nota.dataEmissao,
      )
      .sort((a, b) => (a.data ?? "").localeCompare(b.data ?? ""));

    for (const item of nota.itens) {
      let restante = item.quantidade;
      for (const ordem of candidatas) {
        if (restante <= 0) break;
        for (const linha of ordem.itens) {
          if (linha.produtoId !== item.produtoId) continue;
          const cabe = linha.quantidade - linha.recebido;
          if (cabe <= 0) continue;
          const usado = Math.min(cabe, restante);
          linha.recebido += usado;
          restante -= usado;
          if (restante <= 0) break;
        }
      }
      // Sobra é recebimento sem ordem correspondente — entrada avulsa, ou nota
      // maior que o pedido. O saldo do Tiny já a registrou; aqui ela só não
      // tem o que abater.
    }
  }

  return saida;
}

/**
 * Pares pedidos e ainda não cobertos por nota, somados por cor × numeração.
 * É a coluna "a caminho" da tela.
 */
export function paresACaminho(ordens: OrdemCompra[]): SoladoItemDemanda[] {
  const acumulado = new Map<string, SoladoItemDemanda>();
  for (const ordem of ordens) {
    // Só cancelada sai fora. "Atendida" NÃO serve de corte: o Tiny marca a
    // ordem como atendida quando se vincula uma nota a ela, mesmo numa entrega
    // parcial. Foi o que aconteceu com a OC 2 — 85 pares recebidos de 1.100, e
    // os 1.015 que faltavam sumiram de "a caminho" sem nenhum aviso.
    //
    // Quem responde o que ainda vem é `quantidade - recebido`, calculado das
    // notas de entrada do fornecedor. Se uma ordem for encerrada com menos do
    // que foi pedido, o jeito de tirá-la da conta é cancelar.
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
