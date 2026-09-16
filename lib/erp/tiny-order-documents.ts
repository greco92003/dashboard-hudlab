import "server-only";

import sharp from "sharp";
import { tinyV3Request } from "@/lib/tiny/v3-client";
import { fetchCustomFieldDefs, fetchOpportunityById } from "@/lib/ghl/api";
import { extractGhlProductModels, type GhlProductModel } from "./ghl-product-models";
import { googleDriveFileId } from "./artwork-url";
import { downloadPublicArtworkAsJpeg } from "./google-drive-artwork";
import { matchGhlModel } from "./order-artwork-match";
import { parseSoladoDescricao } from "@/lib/estoque/solados";

export const TINY_ORDER_STATUS_LABELS: Record<number, string> = {
  0: "Em aberto",
  1: "Faturado",
  2: "Cancelado",
  3: "Aprovado",
  4: "Preparando envio",
  5: "Enviado",
  6: "Entregue",
  7: "Pronto para envio",
  8: "Dados incompletos",
  9: "Não entregue",
};

export type TinyOrderSummary = {
  id: number;
  number: string;
  customer: string;
  status: string;
  createdAt: string | null;
};

type TinyProductRef = { id?: number | null; sku?: string | null; descricao?: string | null };

type TinyOrderList = {
  itens?: Array<{
    id: number;
    numeroPedido?: number | string | null;
    situacao?: number | string | null;
    dataCriacao?: string | null;
    cliente?: { nome?: string | null } | null;
    ecommerce?: { numeroPedidoEcommerce?: string | null } | null;
  }>;
  paginacao?: { limit?: number; offset?: number; total?: number };
};

type TinyOrderDetail = {
  id: number;
  numeroPedido?: number | string | null;
  data?: string | null;
  dataPrevista?: string | null;
  observacoes?: string | null;
  cliente?: { nome?: string | null } | null;
  ecommerce?: { numeroPedidoEcommerce?: string | null } | null;
  itens?: Array<{ produto?: TinyProductRef | null; quantidade?: number | null }>;
};

type TinyProduction = {
  produtos?: Array<{ produto?: TinyProductRef | null; quantidade?: number | null }>;
  etapas?: string[];
} | null;

type TinyProductDetail = {
  id: number;
  sku?: string | null;
  descricao?: string | null;
  tipo?: string | null;
  produtoPai?: TinyProductRef | null;
  anexos?: Array<{ url?: string | null; externo?: boolean | null }> | null;
  variacoes?: Array<{ id?: number; grade?: Array<{ chave?: string | null; valor?: string | null }> }> | null;
  producao?: TinyProduction;
};

export type OrderDocumentProduct = {
  reference: string;
  sizes: Array<{ size: string; quantity: number }>;
  totalPairs: number;
  materials: Array<{ name: string; quantity: number }>;
  /** Ex.: "Sola Slide Preto". Substitui as linhas de sola por numeração. */
  soles: string[];
  image: Buffer | null;
};

export type OrderDocument = {
  id: number;
  number: string;
  customer: string;
  orderDate: string | null;
  expectedDate: string | null;
  notes: string;
  products: OrderDocumentProduct[];
};

export async function listTinyOrders(page: number, pageSize: number, search = "") {
  const term = search.trim();
  const response = await tinyV3Request<TinyOrderList>("/pedidos", {
    params: {
      ...(/^\d+$/.test(term) ? { numero: term } : term ? { nomeCliente: term } : {}),
      orderBy: "desc",
      limit: String(pageSize),
      offset: String((page - 1) * pageSize),
    },
  });
  const orders: TinyOrderSummary[] = (response.itens ?? []).map((item) => ({
    id: item.id,
    number: String(item.numeroPedido ?? item.id),
    customer: item.cliente?.nome?.trim() || "Cliente não informado",
    status: TINY_ORDER_STATUS_LABELS[Number(item.situacao)] ?? "—",
    createdAt: item.dataCriacao ?? null,
  }));
  return { orders, total: response.paginacao?.total ?? orders.length };
}

/** O Cadastro ERP grava o deal do GHL como número de e-commerce do pedido. */
export async function findTinyOrderIdByDeal(dealId: string) {
  const ecommerceNumber = `GHL-${dealId}`;
  const response = await tinyV3Request<TinyOrderList>("/pedidos", {
    params: { numeroPedidoEcommerce: ecommerceNumber, limit: "10" },
  });
  const match = (response.itens ?? []).find(
    (item) => item.ecommerce?.numeroPedidoEcommerce === ecommerceNumber && Number(item.situacao) !== 2,
  );
  return match?.id ?? null;
}

function sizeSortKey(size: string) {
  const first = Number(size.match(/\d+/)?.[0]);
  return Number.isFinite(first) ? first : Number.MAX_SAFE_INTEGER;
}

function sizeFromDescription(description: string) {
  return description.match(/(\d{2}\s*\/\s*\d{2})\s*$/)?.[1]?.replace(/\s/g, "") ?? "";
}

function referenceFromDescription(description: string) {
  return description.replace(/\s*[-–]\s*(?:tamanho\s*:?\s*)?\d{2}\s*\/\s*\d{2}\s*$/i, "").trim();
}

async function downloadImage(url: string) {
  const driveId = googleDriveFileId(url);
  if (driveId) return downloadPublicArtworkAsJpeg(driveId);
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Imagem respondeu HTTP ${response.status}.`);
  return sharp(Buffer.from(await response.arrayBuffer()), { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 88 })
    .toBuffer();
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function tryDownloadImage(url: string) {
  try {
    return await downloadImage(url);
  } catch (error) {
    console.error("ERP order document: artwork download failed", formatError(error));
    return null;
  }
}

export async function loadTinyOrderDocument(
  orderId: number,
  options: { materials: boolean; images: boolean },
): Promise<OrderDocument> {
  const order = await tinyV3Request<TinyOrderDetail>(`/pedidos/${orderId}`);
  const productCache = new Map<number, TinyProductDetail>();
  // Sequencial: o Tiny devolve 429 quando as leituras vão em paralelo.
  const getProduct = async (id: number) => {
    const cached = productCache.get(id);
    if (cached) return cached;
    const detail = await tinyV3Request<TinyProductDetail>(`/produtos/${id}`);
    productCache.set(id, detail);
    return detail;
  };

  type Group = {
    parentId: number | null;
    reference: string;
    sizes: Map<string, number>;
    materials: Map<string, number>;
    soles: Set<string>;
  };
  const groups = new Map<string, Group>();

  for (const item of order.itens ?? []) {
    const quantity = Number(item.quantidade ?? 0);
    const productId = item.produto?.id;
    if (!productId || !Number.isFinite(quantity) || quantity <= 0) continue;
    const description = item.produto?.descricao?.trim() ?? "";
    // O Livro Digital e outros serviços entram no pedido, mas não em caixa nem em talão.
    if (/livro digital/i.test(description)) continue;
    const variation = await getProduct(productId);
    if (variation.tipo === "S") continue;

    const parentId = variation.produtoPai?.id ?? null;
    const parent = parentId ? await getProduct(parentId) : null;
    const gradeSize = parent?.variacoes
      ?.find((entry) => entry.id === productId)
      ?.grade?.find((grade) => /tamanho|numera|grade/i.test(grade.chave ?? "") || /^\d{2}\s*\/\s*\d{2}$/.test(grade.valor ?? ""))
      ?.valor?.replace(/\s/g, "");
    const size = gradeSize || sizeFromDescription(description) || "Único";
    const reference = parent?.descricao?.trim()
      || referenceFromDescription(variation.descricao?.trim() || description)
      || description;
    const key = parentId ? `p:${parentId}` : `r:${reference}`;
    const group = groups.get(key) ?? { parentId, reference, sizes: new Map(), materials: new Map(), soles: new Set<string>() };
    groups.set(key, group);
    group.sizes.set(size, (group.sizes.get(size) ?? 0) + quantity);

    if (options.materials && variation.tipo === "F") {
      let production = variation.producao;
      if (!production?.produtos?.length) {
        production = await tinyV3Request<TinyProduction>(`/produtos/${productId}/fabricado`);
      }
      for (const component of production?.produtos ?? []) {
        const name = component.produto?.descricao?.trim() || component.produto?.sku?.trim();
        const perPair = Number(component.quantidade ?? 0);
        if (!name || !Number.isFinite(perPair)) continue;
        // Uma sola por par: a quantidade já está na faixa de numerações.
        const sole = parseSoladoDescricao(name);
        if (sole) {
          group.soles.add(`Sola Slide ${sole.cor}`);
          continue;
        }
        group.materials.set(name, (group.materials.get(name) ?? 0) + perPair * quantity);
      }
    }
  }

  // A ficha do GHL só é lida se algum produto não tiver foto própria no Tiny.
  let ghlModels: Promise<GhlProductModel[]> | null = null;
  const dealId = order.ecommerce?.numeroPedidoEcommerce?.match(/^GHL-(.+)$/)?.[1];
  const loadGhlModels = () => {
    ghlModels ??= dealId
      ? Promise.all([fetchOpportunityById(dealId), fetchCustomFieldDefs("opportunity")])
        .then(([opportunity, definitions]) => extractGhlProductModels(opportunity, definitions))
        .catch((error) => {
          console.error("ERP order document: GHL artwork lookup failed", formatError(error));
          return [];
        })
      : Promise.resolve([]);
    return ghlModels;
  };

  const products: OrderDocumentProduct[] = [];
  for (const group of groups.values()) {
    const sizes = [...group.sizes.entries()]
      .map(([size, quantity]) => ({ size, quantity }))
      .sort((a, b) => sizeSortKey(a.size) - sizeSortKey(b.size) || a.size.localeCompare(b.size));
    let image: Buffer | null = null;
    if (options.images) {
      // A foto anexada ao produto é a do próprio produto, seja ele criado pelo
      // cloner ou à mão. A arte do GHL depende de adivinhar o modelo e fica
      // como reserva.
      const tinyImage = group.parentId
        ? productCache.get(group.parentId)?.anexos?.find((anexo) => anexo.url)?.url
        : null;
      if (tinyImage) image = await tryDownloadImage(tinyImage);
      if (!image) {
        const artUrl = matchGhlModel({ reference: group.reference, sizes }, await loadGhlModels())?.artUrl;
        if (artUrl) image = await tryDownloadImage(artUrl);
      }
    }
    products.push({
      reference: group.reference,
      sizes,
      totalPairs: sizes.reduce((sum, entry) => sum + entry.quantity, 0),
      materials: [...group.materials.entries()]
        .map(([name, quantity]) => ({ name, quantity }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
      soles: [...group.soles],
      image,
    });
  }

  return {
    id: order.id,
    number: String(order.numeroPedido ?? order.id),
    customer: order.cliente?.nome?.trim() || "Cliente não informado",
    orderDate: order.data ?? null,
    expectedDate: order.dataPrevista ?? null,
    notes: order.observacoes?.trim() ?? "",
    products,
  };
}
