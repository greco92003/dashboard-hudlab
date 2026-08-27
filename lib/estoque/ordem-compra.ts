/**
 * Ordens de compra de solado.
 *
 * Vivem no dashboard e não no Tiny porque é o dashboard que gera a OC. O que
 * está "a caminho" é consequência direta delas — pedido menos recebido — e
 * precisa entrar no projetado, senão a tela manda comprar de novo o que já vem
 * vindo.
 *
 * Entrega parcial é o caso normal, não exceção: uma OC pode vir em vários
 * caminhões. Por isso o recebimento é por item e acumulativo, e não um
 * interruptor de "recebida".
 */

import { getSupabaseSecretKey } from "@/lib/supabase/keys-server";
import type { SoladoCor, SoladoItemDemanda } from "./solados";

export type OrdemCompraItem = {
  id: string;
  cor: SoladoCor;
  numeracao: string;
  paresPedidos: number;
  paresRecebidos: number;
};

export type OrdemCompra = {
  id: string;
  numero: string | null;
  fornecedor: string;
  emitidaEm: string;
  previstaPara: string | null;
  observacao: string | null;
  canceladaEm: string | null;
  itens: OrdemCompraItem[];
};

type LinhaItem = {
  id: string;
  cor: string;
  numeracao: string;
  pares_pedidos: number;
  pares_recebidos: number;
};

type LinhaOrdem = {
  id: string;
  numero: string | null;
  fornecedor: string;
  emitida_em: string;
  prevista_para: string | null;
  observacao: string | null;
  cancelada_em: string | null;
  ordem_compra_item: LinhaItem[] | null;
};

function credenciais() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = getSupabaseSecretKey();
  if (!url || !chave) {
    throw new Error("Supabase não configurado para ler ordens de compra.");
  }
  return {
    url,
    headers: {
      apikey: chave,
      Authorization: `Bearer ${chave}`,
      "Content-Type": "application/json",
    },
  };
}

const SELECT_COMPLETO =
  "id,numero,fornecedor,emitida_em,prevista_para,observacao,cancelada_em," +
  "ordem_compra_item(id,cor,numeracao,pares_pedidos,pares_recebidos)";

function mapear(linha: LinhaOrdem): OrdemCompra {
  return {
    id: linha.id,
    numero: linha.numero,
    fornecedor: linha.fornecedor,
    emitidaEm: linha.emitida_em,
    previstaPara: linha.prevista_para,
    observacao: linha.observacao,
    canceladaEm: linha.cancelada_em,
    itens: (linha.ordem_compra_item ?? []).map((item) => ({
      id: item.id,
      cor: item.cor as SoladoCor,
      numeracao: item.numeracao,
      paresPedidos: item.pares_pedidos,
      paresRecebidos: item.pares_recebidos,
    })),
  };
}

/** OCs não canceladas, mais recentes primeiro. */
export async function listarOrdensCompra(): Promise<OrdemCompra[]> {
  const { url, headers } = credenciais();
  const resposta = await fetch(
    `${url}/rest/v1/ordem_compra?select=${SELECT_COMPLETO}` +
      `&cancelada_em=is.null&order=emitida_em.desc`,
    { headers, cache: "no-store" },
  );
  if (!resposta.ok) {
    throw new Error(
      `Falha ao ler ordens de compra: ${resposta.status} ${await resposta.text()}`,
    );
  }
  return ((await resposta.json()) as LinhaOrdem[]).map(mapear);
}

/**
 * Pares pedidos e ainda não recebidos, somados por cor × numeração.
 * É exatamente a coluna "a caminho" da tela.
 */
export function paresACaminho(ordens: OrdemCompra[]): SoladoItemDemanda[] {
  const acumulado = new Map<string, SoladoItemDemanda>();
  for (const ordem of ordens) {
    if (ordem.canceladaEm) continue;
    for (const item of ordem.itens) {
      const faltando = item.paresPedidos - item.paresRecebidos;
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
  numero?: string | null;
  fornecedor?: string;
  emitidaEm?: string;
  previstaPara?: string | null;
  observacao?: string | null;
  criadaPor?: string | null;
  itens: Array<{ cor: SoladoCor; numeracao: string; paresPedidos: number }>;
};

export async function criarOrdemCompra(
  entrada: NovaOrdemCompra,
): Promise<OrdemCompra> {
  const { url, headers } = credenciais();

  const criada = await fetch(`${url}/rest/v1/ordem_compra`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify({
      numero: entrada.numero ?? null,
      fornecedor: entrada.fornecedor ?? "INPU",
      emitida_em: entrada.emitidaEm ?? new Date().toISOString().slice(0, 10),
      prevista_para: entrada.previstaPara ?? null,
      observacao: entrada.observacao ?? null,
      criada_por: entrada.criadaPor ?? null,
    }),
  });
  if (!criada.ok) {
    throw new Error(`Falha ao criar a ordem de compra: ${await criada.text()}`);
  }
  const [ordem] = (await criada.json()) as Array<{ id: string }>;

  const itens = await fetch(`${url}/rest/v1/ordem_compra_item`, {
    method: "POST",
    headers,
    body: JSON.stringify(
      entrada.itens.map((item) => ({
        ordem_compra_id: ordem.id,
        cor: item.cor,
        numeracao: item.numeracao,
        pares_pedidos: item.paresPedidos,
      })),
    ),
  });
  if (!itens.ok) {
    // Sem os itens a OC é um registro vazio que confundiria a tela.
    await fetch(`${url}/rest/v1/ordem_compra?id=eq.${ordem.id}`, {
      method: "DELETE",
      headers,
    });
    throw new Error(`Falha ao gravar os itens da OC: ${await itens.text()}`);
  }

  const completa = await fetch(
    `${url}/rest/v1/ordem_compra?id=eq.${ordem.id}&select=${SELECT_COMPLETO}`,
    { headers, cache: "no-store" },
  );
  const [linha] = (await completa.json()) as LinhaOrdem[];
  return mapear(linha);
}

/** Registra um recebimento. `paresRecebidos` é o acumulado, não o incremento. */
export async function atualizarRecebimento(
  itemId: string,
  paresRecebidos: number,
): Promise<void> {
  const { url, headers } = credenciais();
  const resposta = await fetch(
    `${url}/rest/v1/ordem_compra_item?id=eq.${itemId}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({ pares_recebidos: paresRecebidos }),
    },
  );
  if (!resposta.ok) {
    throw new Error(
      `Falha ao registrar o recebimento: ${await resposta.text()}`,
    );
  }
}

export async function cancelarOrdemCompra(ordemId: string): Promise<void> {
  const { url, headers } = credenciais();
  const resposta = await fetch(`${url}/rest/v1/ordem_compra?id=eq.${ordemId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ cancelada_em: new Date().toISOString() }),
  });
  if (!resposta.ok) {
    throw new Error(`Falha ao cancelar a ordem: ${await resposta.text()}`);
  }
}
