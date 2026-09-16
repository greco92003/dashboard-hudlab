import { NextResponse } from "next/server";
import { orderDocumentError } from "@/lib/erp/order-document-response";
import { buildProductionLabelsPdf } from "@/lib/erp/production-labels-pdf";
import { loadProductionLabels } from "@/lib/erp/tiny-production-order";
import { requireApprovedUser } from "@/lib/security/route-guards";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;

  const orderId = Number((await context.params).id);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return orderDocumentError("Pedido não encontrado.", 404);
  }
  try {
    const { orderNumber, labels } = await loadProductionLabels(orderId);
    if (labels.length === 0) return orderDocumentError("O pedido não tem itens para etiquetar.", 422);
    return new NextResponse(new Uint8Array(buildProductionLabelsPdf(labels)), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Etiquetas-pedido-${orderNumber}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("ERP Tiny labels generation failed", error);
    return orderDocumentError(
      error instanceof Error ? error.message : "Não foi possível gerar as etiquetas.",
      502,
    );
  }
}
