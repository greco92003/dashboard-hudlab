import "server-only";

import { NextResponse } from "next/server";
import { buildRomaneioPdf, buildTalaoPdf } from "./order-pdfs";
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

export async function orderDocumentResponse(orderId: number, kind: OrderDocumentKind, options: { bySku?: boolean } = {}) {
  try {
    const isTalao = kind === "talao";
    const bySku = !isTalao && Boolean(options.bySku);
    const order = await loadTinyOrderDocument(orderId, { materials: isTalao, images: isTalao });
    const pdf = isTalao ? await buildTalaoPdf(order) : buildRomaneioPdf(order, { bySku });
    const label = isTalao ? "Talão" : bySku ? "Romaneio por SKU" : "Romaneio";
    const fileName = `${label} pedido ${order.number}.pdf`;
    const asciiName = isTalao ? "Talao" : bySku ? "Romaneio-por-SKU" : "Romaneio";
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${asciiName}-pedido-${order.number}.pdf"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error(`ERP Tiny ${kind} generation failed`, error);
    return orderDocumentError(
      error instanceof Error ? error.message : "Não foi possível gerar o documento.",
      502,
    );
  }
}
