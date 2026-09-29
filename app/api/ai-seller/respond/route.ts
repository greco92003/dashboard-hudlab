import { NextRequest, NextResponse } from "next/server";
import { requireBearerSecret } from "@/lib/security/route-guards";
import { respondToContact } from "@/lib/ghl/ai-seller/run";

// Chamado pelo workflow "IA Vendedora | Responder" do GHL, ~90s depois de cada
// mensagem do cliente. ?dryRun=1 roda o cérebro sem enviar nem gravar nada.
export async function POST(request: NextRequest) {
  const authError = requireBearerSecret(
    request,
    process.env.AI_SELLER_WEBHOOK_SECRET,
    "AI_SELLER_WEBHOOK_SECRET",
  );
  if (authError) return authError;

  const body = (await request.json().catch(() => null)) as { contactId?: unknown } | null;
  const contactId = typeof body?.contactId === "string" ? body.contactId.trim() : "";
  if (!contactId) {
    return NextResponse.json({ error: "contactId é obrigatório" }, { status: 400 });
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
  try {
    const result = await respondToContact(contactId, { dryRun });
    return NextResponse.json(result);
  } catch (error) {
    console.error("ai-seller respond error:", { contactId, dryRun, error });
    const message = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
