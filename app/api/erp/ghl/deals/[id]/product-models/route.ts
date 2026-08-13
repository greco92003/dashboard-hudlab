import { NextResponse } from "next/server";
import { extractGhlProductModels } from "@/lib/erp/ghl-product-models";
import { extractGhlOrderSource } from "@/lib/erp/order-rules";
import type { ErpDealProductPreview } from "@/lib/erp/types";
import { fetchCustomFieldDefs, fetchOpportunityById } from "@/lib/ghl/api";
import { requireAdmin } from "@/lib/security/route-guards";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireAdmin();
  if (!access.ok) return access.response;

  const { id } = await context.params;
  try {
    const [opportunity, definitions] = await Promise.all([
      fetchOpportunityById(id),
      fetchCustomFieldDefs("opportunity"),
    ]);
    const response: ErpDealProductPreview = {
      deal: {
        id: opportunity.id,
        name: opportunity.name || "Deal sem nome",
        contactId: opportunity.contactId,
        status: opportunity.status,
        monetaryValue: opportunity.monetaryValue,
        createdAt: opportunity.createdAt,
        updatedAt: opportunity.updatedAt,
      },
      models: extractGhlProductModels(opportunity, definitions),
      order: extractGhlOrderSource(opportunity, definitions),
    };
    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("ERP GHL product model preview failed", error);
    return NextResponse.json(
      { error: "Não foi possível interpretar a ficha do pedido deste deal." },
      { status: 502 },
    );
  }
}
