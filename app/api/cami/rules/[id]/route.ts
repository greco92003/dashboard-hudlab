import { NextResponse } from "next/server";
import { requireRole } from "@/lib/security/route-guards";
import { deleteRule, RuleError, updateRule } from "@/lib/ghl/ai-seller/rules";

// Editar, ligar/desligar ou apagar uma regra da casa (só owner).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireRole(["owner"]);
  if (!access.ok) return access.response;
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { texto?: unknown; ativa?: unknown } | null;
  try {
    const rule = await updateRule(
      id,
      { texto: body?.texto, ativa: typeof body?.ativa === "boolean" ? body.ativa : undefined },
      access.user.id,
    );
    if (!rule) return NextResponse.json({ error: "Regra não encontrada" }, { status: 404 });
    return NextResponse.json({ rule });
  } catch (error) {
    if (error instanceof RuleError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("cami rule update error:", { id, error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireRole(["owner"]);
  if (!access.ok) return access.response;
  const { id } = await params;
  try {
    if (!(await deleteRule(id))) return NextResponse.json({ error: "Regra não encontrada" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("cami rule delete error:", { id, error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}
