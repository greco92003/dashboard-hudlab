import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/security/route-guards";
import { loadConversationDetail } from "@/lib/ghl/ai-seller/intel-load";

// Rodadas da Cami com o cliente desde a entrada, promessas de preço/frete e a passagem.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ opportunityId: string }> },
) {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;

  const { opportunityId } = await params;
  try {
    const detail = await loadConversationDetail(opportunityId);
    if (!detail) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
    return NextResponse.json(detail, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("cami conversation detail error:", { opportunityId, error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}
