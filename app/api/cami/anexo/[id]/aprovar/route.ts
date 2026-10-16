import { NextResponse } from "next/server";
import { requireCamiAdmin } from "@/lib/ghl/ai-seller/admin-access";
import { AnnexError, approveAnnex } from "@/lib/ghl/ai-seller/annex";

// O dono aprova a revisão (com os textos que ajustou): vale a partir da próxima resposta da Cami.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireCamiAdmin();
  if (!access.ok) return access.response;
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { textos?: unknown } | null;
  try {
    return NextResponse.json({ vigente: await approveAnnex(id, access.user.id, body?.textos) });
  } catch (error) {
    if (error instanceof AnnexError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("cami anexo aprovar error:", { id, error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}
