import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/security/route-guards";
import { isCamiAdmin } from "@/lib/ghl/ai-seller/admin-shape";
import { loadAnnexPage } from "@/lib/ghl/ai-seller/annex";
import { nextReviewLabel } from "@/lib/ghl/ai-seller/feedback-shape";

// Aba Anexo: revisão para aprovar, anexo em vigor, histórico e fila de feedbacks. Só o dono decide.
export async function GET() {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;
  try {
    return NextResponse.json(
      {
        ...(await loadAnnexPage()),
        podeAprovar: isCamiAdmin(access.profile?.role, access.user.email),
        proximaRevisao: nextReviewLabel(Date.now()),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("cami anexo error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}
