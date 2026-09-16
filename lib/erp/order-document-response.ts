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

export async function orderDocumentResponse(orderId: number, kind: OrderDocumentKind) {
  try {
    const isTalao = kind === "talao";
    const order = await loadTinyOrderDocument(orderId, { materials: isTalao, images: isTalao });
    const pdf = isTalao ? await buildTalaoPdf(order) : buildRomaneioPdf(order);
    const label = isTalao ? "Talão" : "Romaneio";
    const fileName = `${label} pedido ${order.number}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${isTalao ? "Talao" : "Romaneio"}-pedido-${order.number}.pdf"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
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
