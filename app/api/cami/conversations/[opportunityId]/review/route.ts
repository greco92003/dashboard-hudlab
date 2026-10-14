import { NextResponse } from "next/server";
import { requireRole } from "@/lib/security/route-guards";
import { markReviewed } from "@/lib/ghl/ai-seller/intel-load";

// "Revisado": só o owner corrige e revisa a Cami.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ opportunityId: string }> },
) {
  const access = await requireRole(["owner"]);
  if (!access.ok) return access.response;

  const { opportunityId } = await params;
  try {
    const found = await markReviewed(opportunityId);
    if (!found) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("cami review error:", { opportunityId, error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}
