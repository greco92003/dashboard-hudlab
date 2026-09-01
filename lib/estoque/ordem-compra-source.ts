/**
 * Leitura e escrita das ordens de compra no Tiny.
 *
 * O que está "a caminho" é **itens da OC menos o que as notas de entrada do
 * fornecedor já trouxeram**, casado por produto e abatido da ordem mais antiga
 * primeiro. Entrega parcial é o caso normal — a nota 017905 trouxe 85 de 1.100
 * —, então a situação da OC sozinha não basta.
 *
 * Não usamos o vínculo nota↔OC do Tiny: vincular marca a ordem como ATENDIDA
 * mesmo numa entrega parcial, e aí o resto do pedido desapareceria de "a
 * caminho". Ver aplicarRecebimentos em ordem-compra.ts.
 */

import { tinyV3Request } from "@/lib/tiny/v3-client";
import { parseSoladoDescricao } from "./solados";

import {
  aplicarRecebimentos,
  FORNECEDOR_SOLADO_ID,
  FORNECEDOR_SOLADO_NOME,
  OC_SITUACAO,
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
 * OCs do fornecedor de solado, com o recebido apurado pelas notas de entrada.
 * Só a cancelada fica fora do "a caminho" — ver paresACaminho.
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
            // Preenchido depois, por aplicarRecebimentos.
            recebido: 0,
          },
        ];
      }),
    });
  }
  return aplicarRecebimentos(ordens, await lerNotasDeEntrada(ordens));
}

/**
 * Notas de entrada do fornecedor que podem abater as ordens abertas.
 *
 * A janela começa na ordem aberta mais antiga: nota anterior a qualquer ordem
 * não tem o que abater, e ler mais para trás só custa chamada. Nota cancelada
 * fica de fora — ela não entregou nada.
 */
async function lerNotasDeEntrada(
  ordens: OrdemCompra[],
): Promise<NotaEntrada[]> {
  const datas = ordens.map((ordem) => ordem.data).filter((d): d is string => !!d);
  if (datas.length === 0) return [];
  const desde = datas.sort()[0];

  const lista = await tinyV3Request<TinyNotaLista>("/notas", {
    params: {
      tipo: "E",
      dataInicial: desde,
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
