import {
  isOrderDocumentKind,
  orderDocumentError,
  orderDocumentResponse,
} from "@/lib/erp/order-document-response";
import { findTinyOrderIdByDeal } from "@/lib/erp/tiny-order-documents";
import { requireApprovedUser } from "@/lib/security/route-guards";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Talão e romaneio a partir do card do GHL, para o painel da produção. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ dealId: string; document: string }> },
) {
  const access = await requireApprovedUser({ permitirProducao: true });
  if (!access.ok) return access.response;

  const { dealId, document } = await context.params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(dealId) || !isOrderDocumentKind(document)) {
    return orderDocumentError("Documento não encontrado.", 404);
  }

  try {
    const orderId = await findTinyOrderIdByDeal(dealId);
    if (!orderId) {
      return orderDocumentError(
        "Este negócio ainda não tem pedido de venda no Tiny. Crie o pedido em Cadastro ERP antes de gerar o documento.",
        404,
      );
    }
    return orderDocumentResponse(orderId, document);
  } catch (error) {
    console.error("Producao order lookup failed", error);
    return orderDocumentError("Não foi possível localizar o pedido no Tiny.", 502);
  }
}
