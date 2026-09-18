import "server-only";

import { getTinyV2Token } from "@/lib/tiny/auth";
import { tinyV3Request } from "@/lib/tiny/v3-client";
import { createServiceClient } from "@/lib/supabase/service";
import { buildProductionLabels } from "./production-labels";
import {
  checkProductionOrder,
  isProducedItem,
  parseGeneratedItems,
  type ProductionCheck,
} from "./production-order-rules";

const BASE_URL = process.env.TINY_BASE_URL ?? "https://api.tiny.com.br/api2";
const TABLE = "erp_ordens_producao";

/**
 * A API não informa o número da OP criada nem tem tela própria por pedido:
 * o link leva à lista de ordens de produção, onde se filtra pelo pedido.
 * ⚠️ Confirmar a URL com a primeira OP real.
 */
export const TINY_PRODUCTION_ORDERS_URL = "https://erp.tiny.com.br/ordens_producao";

type TinyOrderDetail = {
  id: number;
  numeroPedido?: number | string | null;
  cliente?: { nome?: string | null } | null;
  itens?: Array<{
    produto?: { id?: number | null; sku?: string | null; descricao?: string | null } | null;
    quantidade?: number | null;
  }>;
};

type TinyStock = { saldo?: number | null; reservado?: number | null; disponivel?: number | null };

export type ProductionOrderItem = {
  productId: number | null;
  sku: string;
  description: string;
  quantity: number;
  /** Estoque disponível no Tiny; acima de zero, a OP tende a sair menor. */
  available: number | null;
};

export type ProductionOrderRecord = {
  generatedAt: string;
  generatedBy: string | null;
  ok: boolean;
  check: ProductionCheck;
  tinyMessage: string;
};

export type ProductionOrderPreview = {
  orderId: number;
  orderNumber: string;
  customer: string;
  items: ProductionOrderItem[];
  record: ProductionOrderRecord | null;
  tinyUrl: string;
};

type RecordRow = {
  tiny_pedido_id: number;
  numero_pedido: string;
  gerada_em: string;
  gerada_por_email: string | null;
  conferida: boolean;
  conferencia: ProductionCheck;
  mensagem_tiny: string | null;
};

function toRecord(row: RecordRow | null): ProductionOrderRecord | null {
  if (!row) return null;
  return {
    generatedAt: row.gerada_em,
    generatedBy: row.gerada_por_email,
    ok: row.conferida,
    check: row.conferencia,
    tinyMessage: row.mensagem_tiny ?? "",
  };
}

// A tabela ainda não está nos tipos gerados do Supabase.
function recordsTable() {
  return (createServiceClient() as unknown as { from: (table: string) => any }).from(TABLE);
}

export async function readRecord(orderId: number) {
  const { data, error } = await recordsTable()
    .select("tiny_pedido_id, numero_pedido, gerada_em, gerada_por_email, conferida, conferencia, mensagem_tiny")
    .eq("tiny_pedido_id", orderId)
    .maybeSingle();
  if (error) throw new Error(`Não foi possível ler o registro da OP: ${error.message}`);
  return toRecord(data as RecordRow | null);
}

async function loadOrder(orderId: number) {
  const order = await tinyV3Request<TinyOrderDetail>(`/pedidos/${orderId}`);
  const items = (order.itens ?? [])
    .map((item) => ({
      productId: item.produto?.id ?? null,
      sku: item.produto?.sku?.trim() ?? "",
      description: item.produto?.descricao?.trim() ?? "",
      quantity: Number(item.quantidade ?? 0),
    }))
    .filter((item) => item.quantity > 0 && isProducedItem(item.description));
  return {
    orderId: order.id,
    orderNumber: String(order.numeroPedido ?? order.id),
    customer: order.cliente?.nome?.trim() || "Cliente não informado",
    items,
  };
}

export async function loadProductionOrderPreview(orderId: number): Promise<ProductionOrderPreview> {
  const order = await loadOrder(orderId);
  const stock = new Map<number, number | null>();
  // Sequencial: o Tiny devolve 429 quando as leituras vão em paralelo.
  for (const item of order.items) {
    if (!item.productId || stock.has(item.productId)) continue;
    try {
      const response = await tinyV3Request<TinyStock>(`/estoque/${item.productId}`);
      stock.set(item.productId, Number(response.disponivel ?? response.saldo ?? 0));
    } catch (error) {
      console.error("ERP production order: stock lookup failed", item.productId, error);
      stock.set(item.productId, null);
    }
  }
  return {
    ...order,
    items: order.items.map((item) => ({ ...item, available: item.productId ? stock.get(item.productId) ?? null : null })),
    record: await readRecord(orderId),
    tinyUrl: TINY_PRODUCTION_ORDERS_URL,
  };
}

type TinyV2GenerateReturn = {
  status?: string;
  status_geracao_ordens?: string;
  mensagem_geracao_ordens?: string;
  erros?: Array<{ erro?: string }> | { erro?: string };
  itens?: unknown;
};

async function generateInTiny(orderId: number) {
  const response = await fetch(`${BASE_URL}/gerar.ordem.producao.pedido.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ token: getTinyV2Token(), formato: "JSON", id: String(orderId), lancarEstoque: "N" }),
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Tiny API v2 respondeu HTTP ${response.status}.`);
  const retorno = (JSON.parse(text) as { retorno?: TinyV2GenerateReturn }).retorno;
  if (!retorno) throw new Error("Resposta sem o campo retorno do Tiny.");
  // O formato real só será confirmado com a primeira OP: fica no log.
  console.info("ERP production order: Tiny v2 response", orderId, text.slice(0, 2_000));
  if (retorno.status !== "OK") {
    const errors = Array.isArray(retorno.erros) ? retorno.erros : retorno.erros ? [retorno.erros] : [];
    const message = errors.map((entry) => entry.erro).filter(Boolean).join(" ");
    throw new Error(message || "O Tiny recusou a geração da ordem de produção.");
  }
  return retorno;
}

export class ProductionOrderAlreadyGenerated extends Error {}

export async function generateProductionOrder(
  orderId: number,
  options: { force: boolean; userEmail: string | null },
): Promise<ProductionOrderPreview & { saved: boolean }> {
  const existing = await readRecord(orderId);
  if (existing && !options.force) {
    throw new ProductionOrderAlreadyGenerated("A ordem de produção deste pedido já foi gerada.");
  }

  const order = await loadOrder(orderId);
  const retorno = await generateInTiny(orderId);
  const check = checkProductionOrder(order.items, parseGeneratedItems(retorno.itens));
  const tinyMessage = [retorno.status_geracao_ordens === "Alertas" ? "Alertas" : "", retorno.mensagem_geracao_ordens ?? ""]
    .filter(Boolean)
    .join(": ");
  const row = {
    tiny_pedido_id: orderId,
    numero_pedido: order.orderNumber,
    gerada_em: new Date().toISOString(),
    gerada_por_email: options.userEmail,
    conferida: check.ok,
    conferencia: check,
    mensagem_tiny: tinyMessage || null,
  };

  // A OP já existe no Tiny: falha ao registrar não pode esconder o resultado.
  let saved = true;
  const { error } = await recordsTable().upsert(row, { onConflict: "tiny_pedido_id" });
  if (error) {
    saved = false;
    console.error("ERP production order: record save failed", orderId, error);
  }

  return {
    ...order,
    items: order.items.map((item) => ({ ...item, available: null })),
    record: toRecord(row),
    tinyUrl: TINY_PRODUCTION_ORDERS_URL,
    saved,
  };
}

export async function loadProductionLabels(orderId: number) {
  const order = await loadOrder(orderId);
  return { orderNumber: order.orderNumber, labels: buildProductionLabels(order.items) };
}
