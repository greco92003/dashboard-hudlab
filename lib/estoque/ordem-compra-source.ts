/**
 * Leitura e escrita das ordens de compra no Tiny.
 *
 * O que está "a caminho" sai do AGREGADO: total pedido em todas as ordens menos
 * total recebido nas notas do fornecedor, por produto. Ver `consolidarCompras`
 * em ordem-compra.ts para o porquê — em resumo, o Tiny desmembra a ordem ao
 * receber e separa a nota dos itens que ela abateu.
 */

import { tinyV3Request } from "@/lib/tiny/v3-client";
import { parseSoladoDescricao } from "./solados";

import {
  consolidarCompras,
  FORNECEDOR_SOLADO_ID,
  FORNECEDOR_SOLADO_NOME,
  OC_SITUACAO,
  type ConsolidadoCompra,
  type NotaEntrada,
  type NovaOrdemCompra,
  type OrdemCompra,
} from "./ordem-compra";

type TinyOcLista = {
  itens?: Array<{ id: number; numeroPedido?: string | null }>;
};

type TinyOcDetalhe = {
  id: number;
  numeroPedido?: string | null;
  data?: string | null;
  dataPrevista?: string | null;
  situacao?: string | null;
  contato?: { nome?: string | null } | null;
  notaFiscal?: {
    id?: number | null;
    numero?: string | null;
    dataEmissao?: string | null;
  } | null;
  itens?: Array<{
    produto?: { id?: number | null; descricao?: string | null } | null;
    quantidade?: number | null;
    preco?: number | null;
  }>;
};

type TinyNotaDetalhe = {
  itens?: Array<{ idProduto?: number | null; quantidade?: number | null }>;
};

type TinyNotaLista = {
  itens?: Array<{
    id: number;
    numero?: string | null;
    dataEmissao?: string | null;
    situacao?: string | null;
    cliente?: { nome?: string | null } | null;
  }>;
};

/** `situacao` de nota cancelada. Ela não entregou nada. */
const NOTA_CANCELADA = "3";

/**
 * Todas as OCs do fornecedor de solado, como estão no Tiny. Quem decide o que
 * ainda vem é `consolidarCompras`, não esta leitura.
 */
export async function listarOrdensCompra(): Promise<OrdemCompra[]> {
  const lista = await tinyV3Request<TinyOcLista>("/ordem-compra", {
    params: { nomeFornecedor: FORNECEDOR_SOLADO_NOME, limit: "100" },
  });

  const ordens: OrdemCompra[] = [];
  // Sequencial: o Tiny devolve 429 quando as leituras vão em paralelo.
  for (const resumo of lista.itens ?? []) {
    const detalhe = await tinyV3Request<TinyOcDetalhe>(
      `/ordem-compra/${resumo.id}`,
    );

    ordens.push({
      id: detalhe.id,
      numeroPedido: detalhe.numeroPedido ?? null,
      data: detalhe.data ?? null,
      dataPrevista: detalhe.dataPrevista ?? null,
      situacao: detalhe.situacao ?? null,
      fornecedor: detalhe.contato?.nome ?? null,
      notaFiscal:
        detalhe.notaFiscal?.id && detalhe.notaFiscal.numero
          ? {
              id: detalhe.notaFiscal.id,
              numero: detalhe.notaFiscal.numero,
              dataEmissao: detalhe.notaFiscal.dataEmissao ?? "",
            }
          : null,
      itens: (detalhe.itens ?? []).flatMap((item) => {
        const produtoId = item.produto?.id;
        if (typeof produtoId !== "number") return [];
        const descricao = item.produto?.descricao?.trim() ?? "";
        const parsed = parseSoladoDescricao(descricao);
        return [
          {
            produtoId,
            descricao,
            cor: parsed?.cor ?? null,
            numeracao: parsed?.numeracao ?? null,
            quantidade: Number(item.quantidade ?? 0),
            preco: Number(item.preco ?? 0),
          },
        ];
      }),
    });
  }
  return ordens;
}

/**
 * Notas de entrada do fornecedor que abatem as ordens.
 *
 * A janela começa na ordem NÃO CANCELADA mais antiga. Isso não é só economia de
 * chamada: a nota 017903, de 17/08, trouxe 1.050 pares de uma remessa anterior
 * ao nosso controle, que já foram absorvidos na contagem física de 26/08.
 * Contá-la abateria 1.050 pares que estão de pé.
 */
async function lerRecebimentosDoFornecedor(
  ordens: OrdemCompra[],
): Promise<NotaEntrada[]> {
  const datas = ordens
    .filter((ordem) => ordem.situacao !== OC_SITUACAO.cancelado)
    .map((ordem) => ordem.data)
    .filter((data): data is string => Boolean(data))
    .sort();
  if (datas.length === 0) return [];

  const lista = await tinyV3Request<TinyNotaLista>("/notas", {
    params: {
      tipo: "E",
      dataInicial: datas[0],
      dataFinal: new Date().toISOString().slice(0, 10),
      limit: "100",
    },
  });

  const doFornecedor = (lista.itens ?? []).filter(
    (nota) =>
      nota.situacao !== NOTA_CANCELADA &&
      new RegExp(FORNECEDOR_SOLADO_NOME, "i").test(nota.cliente?.nome ?? ""),
  );

  const notas: NotaEntrada[] = [];
  // Sequencial: o Tiny devolve 429 quando as leituras vão em paralelo.
  for (const resumo of doFornecedor) {
    const detalhe = await tinyV3Request<TinyNotaDetalhe>(`/notas/${resumo.id}`);
    notas.push({
      id: resumo.id,
      numero: resumo.numero ?? null,
      dataEmissao: (resumo.dataEmissao ?? "").slice(0, 10),
      itens: (detalhe.itens ?? []).flatMap((item) => {
        const quantidade = Number(item.quantidade ?? 0);
        return typeof item.idProduto === "number" &&
          Number.isFinite(quantidade) &&
          quantidade > 0
          ? [{ produtoId: item.idProduto, quantidade }]
          : [];
      }),
    });
  }
  return notas;
}

/**
 * As ordens e o consolidado por numeração numa leitura só. É o que a tela de
 * ordens e o cálculo de "a caminho" precisam, e evita ler o Tiny duas vezes.
 */
export async function lerCompras(): Promise<{
  ordens: OrdemCompra[];
  notas: NotaEntrada[];
  consolidado: ConsolidadoCompra[];
}> {
  const ordens = await listarOrdensCompra();
  const notas = await lerRecebimentosDoFornecedor(ordens);
  return { ordens, notas, consolidado: consolidarCompras(ordens, notas) };
}

export async function criarOrdemCompra(
  entrada: NovaOrdemCompra,
): Promise<{ id: number }> {
  return tinyV3Request<{ id: number }>("/ordem-compra", {
    method: "POST",
    body: {
      contato: { id: FORNECEDOR_SOLADO_ID },
      data: new Date().toISOString().slice(0, 10),
      dataPrevista: entrada.dataPrevista ?? undefined,
      observacoes: entrada.observacoes ?? undefined,
      itens: entrada.itens.map((item) => ({
        produto: { id: item.produtoId },
        quantidade: item.quantidade,
        valor: item.valor,
      })),
    },
  });
}

export async function cancelarOrdemCompra(id: number): Promise<void> {
  await tinyV3Request(`/ordem-compra/${id}/situacao`, {
    method: "PUT",
    body: { situacao: OC_SITUACAO.cancelado },
  });
}
