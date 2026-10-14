import { NextResponse } from "next/server";
import { requireRole } from "@/lib/security/route-guards";
import { deleteReference } from "@/lib/ghl/ai-seller/rules";

// Apaga uma conversa de referência (só owner).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireRole(["owner"]);
  if (!access.ok) return access.response;
  const { id } = await params;
  try {
    if (!(await deleteReference(id))) return NextResponse.json({ error: "Referência não encontrada" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("cami reference delete error:", { id, error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}
