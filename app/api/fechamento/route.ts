import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/security/route-guards";
import { carregarPainel } from "@/lib/fechamento/load";

// Painel de fechamento: os cards com a cor e o prazo de agora.
export async function GET() {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;
  try {
    return NextResponse.json(await carregarPainel(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("fechamento GET error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}
