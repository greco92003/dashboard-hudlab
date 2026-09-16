import {
  isOrderDocumentKind,
  orderDocumentError,
  orderDocumentResponse,
} from "@/lib/erp/order-document-response";
import { requireApprovedUser } from "@/lib/security/route-guards";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; document: string }> },
) {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;

  const { id, document } = await context.params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0 || !isOrderDocumentKind(document)) {
    return orderDocumentError("Documento não encontrado.", 404);
  }
  return orderDocumentResponse(orderId, document);
}
