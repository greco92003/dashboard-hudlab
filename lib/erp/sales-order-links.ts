import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { TinyV3HttpError, tinyV3Request } from "@/lib/tiny/v3-client";
import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Vínculo negócio do GHL → pedidos de venda no Tiny (tabela erp_pedidos_venda).
 *
 * O Tiny apaga o número de e-commerce ("GHL-<deal>") quando o pedido é faturado
 * ou editado na tela dele, e a API não filtra pela ordem de compra, onde a cópia
 * sobrevive. Por isso o vínculo é gravado aqui na criação e é a primeira fonte
 * consultada; a busca no Tiny fica como reserva e realimenta a tabela.
 *
 * Um negócio pode ter vários pedidos (recompra ou lotes no mesmo card); cada
 * pedido pertence a um só negócio.
 */

const TABLE = "erp_pedidos_venda";

/** Situações do Tiny em que o pedido ainda não foi aprovado nem faturado. */
const OPEN_STATUSES = new Set([0, 8]); // Em aberto, Dados incompletos
const CANCELLED_STATUS = 2;

export type SalesOrderLinkSource = "cadastro-erp" | "tiny" | "script";

export type SalesOrderLink = {
  dealId: string;
  orderId: number;
  orderNumber: string;
  customer: string | null;
  source: SalesOrderLinkSource;
};

type SalesOrderDatabase = {
  public: {
    Tables: Pick<Database["public"]["Tables"], typeof TABLE>;
    Views: Record<never, never>;
    Functions: Record<never, never>;
  };
};

function linksTable() {
  // Isola a definição da tabela dos tipos legados do restante do schema.
  const client = createServiceClient() as unknown as SupabaseClient<SalesOrderDatabase>;
  return client.from(TABLE);
}

/** Pedidos vinculados ao negócio, do mais novo para o mais antigo. */
export async function readSalesOrderLinks(dealId: string): Promise<SalesOrderLink[]> {
  const { data, error } = await linksTable()
    .select("deal_id, tiny_pedido_id, numero_pedido, cliente, origem")
    .eq("deal_id", dealId)
    .order("tiny_pedido_id", { ascending: false });
  if (error) throw new Error(`Não foi possível ler os vínculos do pedido: ${error.message}`);
  return (data ?? []).map((row) => ({
    dealId: row.deal_id,
    orderId: Number(row.tiny_pedido_id),
    orderNumber: row.numero_pedido,
    customer: row.cliente,
    source: row.origem,
  }));
}

/** Grava o vínculo de um pedido (um pedido pertence a um só negócio). */
export async function saveSalesOrderLink(link: SalesOrderLink) {
  const { error } = await linksTable().upsert(
    {
      deal_id: link.dealId,
      tiny_pedido_id: link.orderId,
      numero_pedido: link.orderNumber,
      cliente: link.customer,
      origem: link.source,
      vinculado_em: new Date().toISOString(),
    },
    { onConflict: "tiny_pedido_id" },
  );
  if (error) throw new Error(`Não foi possível gravar o vínculo do pedido: ${error.message}`);
}

/** Uma falha ao gravar o vínculo não invalida um pedido já encontrado ou criado. */
export async function trySaveSalesOrderLink(link: SalesOrderLink) {
  try {
    await saveSalesOrderLink(link);
  } catch (error) {
    console.error("ERP sales order link save failed", error instanceof Error ? error.message : error);
  }
}

type TinyOrderStatus = { id: number; situacao?: number | string | null };

/**
 * Pedido vinculado mais novo que ainda vale, conferido no Tiny:
 *  - "active": qualquer um que exista e não esteja cancelado (talão/romaneio);
 *  - "open": só os ainda não aprovados/faturados (anti-duplicação do Cadastro ERP —
 *    depois de faturado, um pedido novo no mesmo negócio é recompra ou outro lote).
 * Vínculo morto (pedido apagado) é pulado. Falha de leitura da tabela devolve
 * null para a busca seguir pelo Tiny.
 */
export async function findLinkedTinyOrder(dealId: string, want: "active" | "open"): Promise<SalesOrderLink | null> {
  const links = await readSalesOrderLinks(dealId).catch((error: unknown) => {
    console.error("ERP sales order links read failed", error instanceof Error ? error.message : error);
    return [];
  });
  for (const link of links) {
    const order = await tinyV3Request<TinyOrderStatus>(`/pedidos/${link.orderId}`).catch((error: unknown) => {
      if (error instanceof TinyV3HttpError && error.status === 404) return null;
      throw error;
    });
    if (!order || order.situacao == null) continue;
    const status = Number(order.situacao);
    if (!Number.isInteger(status) || status === CANCELLED_STATUS) continue;
    if (want === "active" || OPEN_STATUSES.has(status)) return link;
  }
  return null;
}
