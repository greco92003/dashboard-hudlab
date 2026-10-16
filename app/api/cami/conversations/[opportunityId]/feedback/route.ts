import { after, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/security/route-guards";
import { createSupabaseServerForSync } from "@/lib/supabase/server";
import { generateAnnexDraft } from "@/lib/ghl/ai-seller/annex";
import { canGiveFeedback, createFeedback, notifyUrgentFeedback, pendingFeedbackCount } from "@/lib/ghl/ai-seller/feedback";
import { nextReviewLabel, validateFeedbackInput } from "@/lib/ghl/ai-seller/feedback-shape";

// Feedback sobre um atendimento da Cami: o owner e quem recebe as passagens.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ opportunityId: string }> },
) {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;
  const { opportunityId } = await params;

  try {
    if (!(await canGiveFeedback(access.user.id, access.profile?.role))) {
      return NextResponse.json({ error: "Só o dono e quem recebe as passagens dão feedback para a Cami" }, { status: 403 });
    }
    const valid = validateFeedbackInput(await request.json().catch(() => null));
    if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });

    const supabase = await createSupabaseServerForSync();
    const { data: conv, error } = await supabase
      .from("ai_seller_conversations")
      .select("contact_id, contact_name")
      .eq("opportunity_id", opportunityId)
      .maybeSingle();
    if (error) throw new Error(`ai_seller_conversations: ${error.message}`);
    if (!conv) return NextResponse.json({ error: "Atendimento não encontrado" }, { status: 404 });

    const contactName = (conv.contact_name as string) || null;
    const feedback = await createFeedback({
      ...valid.value,
      opportunityId,
      contactId: conv.contact_id as string,
      contactName,
      userId: access.user.id,
    });
    // Urgente: a revisão do anexo sai na hora (o dono recebe o push quando fica pronta).
    if (feedback.urgente) {
      const userId = access.user.id;
      after(async () => {
        try {
          if (await generateAnnexDraft("urgente")) return;
        } catch (err) {
          console.error("cami feedback urgente: revisão não gerada", { opportunityId, err });
        }
        await notifyUrgentFeedback({ feedback, opportunityId, contactName, userId });
      });
    }
    return NextResponse.json({
      feedback,
      pendentes: await pendingFeedbackCount(),
      proximaRevisao: nextReviewLabel(Date.now()),
    });
  } catch (error) {
    console.error("cami feedback error:", { opportunityId, error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}
