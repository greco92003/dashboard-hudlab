import { after } from "next/server";
import {
  isOrderDocumentKind,
  orderDocumentError,
  orderDocumentResponse,
  orderPdfResponse,
  romaneioBySku,
} from "@/lib/erp/order-document-response";
import { findTinyOrderIdByDeal } from "@/lib/erp/tiny-order-documents";
import { lerTalaoProducao, processarTalaoProducao } from "@/lib/producao/taloes";
import { requireApprovedUser } from "@/lib/security/route-guards";

export const runtime = "nodejs";
export const maxDuration = 300;

const PEDIDO_SEM_VINCULO = "Não encontrei um pedido do Tiny vinculado a este negócio. Se o pedido já existe, gere o documento em Cadastro ERP → Pedidos do Tiny.";

/** Talão e romaneio a partir do card do GHL, para o painel da produção. */
export async function GET(
  request: Request,
  context: { params: Promise<{ dealId: string; document: string }> },
) {
  const access = await requireApprovedUser({ permitirProducao: true });
  if (!access.ok) return access.response;

  const { dealId, document } = await context.params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(dealId) || !isOrderDocumentKind(document)) {
    return orderDocumentError("Documento não encontrado.", 404);
  }

  try {
    if (document === "talao") {
      const talao = await lerTalaoProducao(dealId).catch((error) => {
        console.error("Falha ao ler o talão armazenado", error);
        return null;
      });
      if (talao?.estado === "pronto") {
        return orderPdfResponse(talao.pdf, talao.orderNumber, document);
      }
      if (talao?.estado === "sem-pedido") {
        return orderDocumentError(PEDIDO_SEM_VINCULO, 404);
      }
      if (talao?.estado === "pendente") {
        // Prioriza um talão solicitado quando ainda está na fila.
        if (talao.disponivel) {
          after(async () => {
            try {
              await processarTalaoProducao(dealId);
            } catch (error) {
              console.error("Falha ao processar o talão solicitado", error);
            }
          });
        }
        const resposta = orderDocumentError("O talão ainda está sendo preparado. Tente novamente em instantes.", 202);
        resposta.headers.set("Retry-After", "4");
        return resposta;
      }
    }

    const orderId = await findTinyOrderIdByDeal(dealId);
    if (!orderId) {
      return orderDocumentError(PEDIDO_SEM_VINCULO, 404);
    }
    return orderDocumentResponse(orderId, document, { bySku: romaneioBySku(request), dealId });
  } catch (error) {
    console.error("Producao order lookup failed", error);
    return orderDocumentError("Não foi possível localizar o pedido no Tiny.", 502);
  }
}
