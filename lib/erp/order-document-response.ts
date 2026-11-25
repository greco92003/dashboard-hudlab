import "server-only";

import { NextResponse } from "next/server";
import { buildRomaneioPdf, buildRomaneioPorSetorPdf, buildTalaoPdf } from "./order-pdfs";
import { dealIdDoPedido, lerParesIdentificados } from "./pares-identificados-db";
import { loadTinyOrderDocument } from "./tiny-order-documents";

export type OrderDocumentKind = "talao" | "romaneio";

export function isOrderDocumentKind(value: string): value is OrderDocumentKind {
  return value === "talao" || value === "romaneio";
}

/**
 * Os botões abrem o PDF numa aba nova; um erro em JSON cru ali não diz nada
 * para quem está no chão de fábrica, então a falha volta como texto legível.
 */
export function orderDocumentError(message: string, status: number) {
  return new NextResponse(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** `?agrupar=sku` pede o romaneio com um único SKU por caixa. */
export function romaneioBySku(request: Request) {
  return new URL(request.url).searchParams.get("agrupar") === "sku";
}

export async function generateOrderDocument(orderId: number, kind: OrderDocumentKind, options: { bySku?: boolean; dealId?: string } = {}) {
  const isTalao = kind === "talao";
  const order = await loadTinyOrderDocument(orderId, { materials: isTalao, images: isTalao, dealId: options.dealId });
  if (isTalao) return { pdf: await buildTalaoPdf(order), orderNumber: order.number };

  // Negócio com lista de pessoas: uma filial + setor por caixa, sempre.
  const dealId = order.dealId ?? (await dealIdDoPedido(orderId));
  const pares = dealId ? await lerParesIdentificados(dealId) : [];
  const pdf = pares.length > 0
    ? buildRomaneioPorSetorPdf(order, pares)
    : buildRomaneioPdf(order, { bySku: options.bySku });
  return { pdf, orderNumber: order.number };
}

export function orderPdfResponse(pdf: Buffer, orderNumber: string, kind: OrderDocumentKind, bySku = false) {
  const isTalao = kind === "talao";
  const label = isTalao ? "Talão" : bySku ? "Romaneio por SKU" : "Romaneio";
  const asciiLabel = isTalao ? "Talao" : bySku ? "Romaneio-por-SKU" : "Romaneio";
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${asciiLabel}-pedido-${orderNumber}.pdf"; filename*=UTF-8''${encodeURIComponent(`${label} pedido ${orderNumber}.pdf`)}`,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function orderDocumentResponse(orderId: number, kind: OrderDocumentKind, options: { bySku?: boolean; dealId?: string } = {}) {
  try {
    const { pdf, orderNumber } = await generateOrderDocument(orderId, kind, options);
    return orderPdfResponse(pdf, orderNumber, kind, options.bySku);
  } catch (error) {
    console.error(`ERP Tiny ${kind} generation failed`, error);
    return orderDocumentError(
      error instanceof Error ? error.message : "Não foi possível gerar o documento.",
      502,
    );
  }
}
