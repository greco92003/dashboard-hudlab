import "server-only";

import { tinyV3Request } from "@/lib/tiny/v3-client";
import type { TinyContaBruta, TipoConta } from "./regras";

const CAMINHO: Record<TipoConta, string> = {
  pagar: "/contas-pagar",
  receber: "/contas-receber",
};
const LIMITE = 100;
const MAX_PAGINAS = 80;

type Pagina<T> = { itens?: T[]; paginacao?: { total?: number } };

export type OpcaoTiny = { id: number; descricao: string; grupo: string | null };
export type ContatoTiny = { id: number; nome: string; cpfCnpj: string | null };

export type NovaContaPagarTiny = {
  dataVencimento: string;
  valor: number;
  contato: { id: number };
  historico: string;
  categoria?: { id: number };
  numeroDocumento?: string;
  ocorrencia: "U" | "M" | "P";
  diaVencimento?: number;
  quantidadeParcelas?: number;
};

export type BaixaTiny = {
  data: string; // dd/MM/yyyy
  valorPago: number;
  juros: number;
  desconto: number;
  contaOrigem?: { id: number };
  contaDestino?: { id: number };
};

/** `completo` = false quando bateu no teto de páginas (não podar nesse caso). */
async function listarPaginado<T>(
  caminho: string,
  filtros: Record<string, string>,
): Promise<{ itens: T[]; completo: boolean }> {
  const itens: T[] = [];
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const offset = pagina * LIMITE;
    const resposta = await tinyV3Request<Pagina<T>>(caminho, {
      params: { ...filtros, limit: String(LIMITE), offset: String(offset) },
    });
    const lote = resposta?.itens ?? [];
    itens.push(...lote);
    const total = resposta?.paginacao?.total;
    if (lote.length < LIMITE || (total !== undefined && offset + lote.length >= total)) {
      return { itens, completo: true };
    }
  }
  return { itens, completo: false };
}

export function listarContasTiny(tipo: TipoConta, filtros: Record<string, string>) {
  return listarPaginado<TinyContaBruta>(CAMINHO[tipo], filtros);
}

export function obterContaTiny(tipo: TipoConta, id: number) {
  return tinyV3Request<TinyContaBruta>(`${CAMINHO[tipo]}/${id}`);
}

export async function criarContaPagarTiny(conta: NovaContaPagarTiny): Promise<number> {
  const resposta = await tinyV3Request<{ id?: number }>("/contas-pagar", { method: "POST", body: conta });
  if (!resposta?.id) throw new Error("O Tiny não devolveu o id da conta criada.");
  return Number(resposta.id);
}

export async function baixarContaTiny(tipo: TipoConta, id: number, baixa: BaixaTiny): Promise<void> {
  await tinyV3Request<void>(`${CAMINHO[tipo]}/${id}/baixar`, { method: "POST", body: baixa });
}

export async function listarCategoriasTiny(): Promise<OpcaoTiny[]> {
  const { itens } = await listarPaginado<{ id: number; descricao: string; grupo?: string | null }>(
    "/categorias-receita-despesa",
    {},
  );
  return itens.map((c) => ({ id: Number(c.id), descricao: c.descricao, grupo: c.grupo ?? null }));
}

export async function listarContasFinanceirasTiny(): Promise<OpcaoTiny[]> {
  const { itens } = await listarPaginado<{ id: number; descricao: string }>("/contas-financeiras", {
    situacao: "A",
  });
  return itens.map((c) => ({ id: Number(c.id), descricao: c.descricao, grupo: null }));
}

export async function buscarContatosTiny(nome: string): Promise<ContatoTiny[]> {
  const resposta = await tinyV3Request<Pagina<{ id: number; nome?: string; cpfCnpj?: string | null }>>(
    "/contatos",
    { params: { nome, limit: "20", offset: "0" } },
  );
  return (resposta?.itens ?? []).map((c) => ({
    id: Number(c.id),
    nome: c.nome ?? `Contato ${c.id}`,
    cpfCnpj: c.cpfCnpj || null,
  }));
}
