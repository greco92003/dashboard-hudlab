import { NextResponse } from "next/server";
import { requireRole } from "@/lib/security/route-guards";
import { AnnexError, discardAnnex } from "@/lib/ghl/ai-seller/annex";

// O dono descarta a revisão: o anexo em vigor continua.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireRole(["owner"]);
  if (!access.ok) return access.response;
  const { id } = await params;
  try {
    await discardAnnex(id, access.user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AnnexError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("cami anexo descartar error:", { id, error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}
