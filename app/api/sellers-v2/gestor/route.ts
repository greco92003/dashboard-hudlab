import { NextResponse } from "next/server";
import { requireRole } from "@/lib/security/route-guards";
import { loadGestorView } from "@/lib/sellers-v2/team";

// Visão do gestor da Arena (só owner): quem treinou, evolução e pontos fracos do time.
export async function GET() {
  const access = await requireRole(["owner"]);
  if (!access.ok) return access.response;
  try {
    return NextResponse.json(await loadGestorView(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("arena gestor error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}
