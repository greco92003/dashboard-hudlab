/**
 * Leitura e escrita das ordens de compra no Tiny.
 *
 * O que está "a caminho" é **itens da OC menos itens das notas vinculadas**. O
 * item da OC no Tiny não tem quantidade recebida, e entrega parcial é o caso
 * normal (a nota 17904 do INPU entregou 220 de 1.100), então a  da
 * OC sozinha não basta.
 */

import { tinyV3Request } from "@/lib/tiny/v3-client";
import { parseSoladoDescricao } from "./solados";

import {
  FORNECEDOR_SOLADO_ID,
  FORNECEDOR_SOLADO_NOME,
  OC_SITUACAO,
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

/**
 * OCs do fornecedor de solado que ainda podem trazer material.
 * Cancelada e atendida não entram no "a caminho".
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

    // Itens da nota vinculada abatem a OC linha a linha, por id de produto.
    const recebidoPorProduto = new Map<number, number>();
    if (detalhe.notaFiscal?.id) {
      const nota = await tinyV3Request<TinyNotaDetalhe>(
        `/notas/${detalhe.notaFiscal.id}`,
      );
      for (const item of nota.itens ?? []) {
        if (typeof item.idProduto !== "number") continue;
        const quantidade = Number(item.quantidade ?? 0);
        if (!Number.isFinite(quantidade) || quantidade <= 0) continue;
        recebidoPorProduto.set(
          item.idProduto,
          (recebidoPorProduto.get(item.idProduto) ?? 0) + quantidade,
        );
      }
    }

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
            recebido: recebidoPorProduto.get(produtoId) ?? 0,
          },
        ];
      }),
    });
  }
  return ordens;
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
