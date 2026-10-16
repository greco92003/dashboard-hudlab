import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/security/route-guards";
import { loadConversationDetail } from "@/lib/ghl/ai-seller/intel-load";
import { isCamiAdmin } from "@/lib/ghl/ai-seller/admin-shape";
import { canGiveFeedback, listFeedback } from "@/lib/ghl/ai-seller/feedback";
import { nextReviewLabel } from "@/lib/ghl/ai-seller/feedback-shape";

// O atendimento: a conversa do WhatsApp, as rodadas da Cami, promessas de
// preço/frete, a passagem e os feedbacks já dados.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ opportunityId: string }> },
) {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;

  const { opportunityId } = await params;
  try {
    const [detail, feedbacks, podeDarFeedback] = await Promise.all([
      loadConversationDetail(opportunityId),
      listFeedback(opportunityId),
      canGiveFeedback(access.user.id, access.profile?.role, access.user.email),
    ]);
    if (!detail) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
    return NextResponse.json(
      {
        ...detail,
        feedbacks,
        podeDarFeedback,
        podeRevisar: isCamiAdmin(access.profile?.role, access.user.email),
        proximaRevisao: nextReviewLabel(Date.now()),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("cami conversation detail error:", { opportunityId, error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}
