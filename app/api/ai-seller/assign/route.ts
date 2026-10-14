import { NextRequest, NextResponse } from "next/server";
import { requireBearerSecret } from "@/lib/security/route-guards";
import { assignToSeller } from "@/lib/ghl/ai-seller/assign";

// Chamado pelo workflow "IA Vendedora | Entrada" do GHL quando a amostra
// digital é entregue: decide se a Cami assume o cliente. ?dryRun=1 só decide,
// sem marcar nada no GHL.
export async function POST(request: NextRequest) {
  const authError = requireBearerSecret(
    request,
    process.env.AI_SELLER_WEBHOOK_SECRET,
    "AI_SELLER_WEBHOOK_SECRET",
  );
  if (authError) return authError;

  const body = (await request.json().catch(() => null)) as
    | { contactId?: unknown; opportunityId?: unknown }
    | null;
  const contactId = typeof body?.contactId === "string" ? body.contactId.trim() : "";
  if (!contactId) {
    return NextResponse.json({ error: "contactId é obrigatório" }, { status: 400 });
  }
  const opportunityId =
    typeof body?.opportunityId === "string" && body.opportunityId.trim()
      ? body.opportunityId.trim()
      : null;
  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";

  try {
    return NextResponse.json(await assignToSeller(contactId, { opportunityId, dryRun }));
  } catch (error) {
    console.error("ai-seller assign error:", { contactId, opportunityId, dryRun, error });
    const message = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
