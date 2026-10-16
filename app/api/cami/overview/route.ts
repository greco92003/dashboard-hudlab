import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/security/route-guards";
import { isCamiAdmin } from "@/lib/ghl/ai-seller/admin-shape";
import { loadOverview } from "@/lib/ghl/ai-seller/intel-load";
import type { Periodo } from "@/lib/ghl/ai-seller/intel";

const PERIODOS: readonly Periodo[] = ["hoje", "7d", "30d", "tudo"];

// Visão geral da CAMI Intelligence: números do período, funil e referência "antes da Cami".
export async function GET(request: NextRequest) {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;

  const raw = request.nextUrl.searchParams.get("periodo") as Periodo | null;
  const periodo = raw && PERIODOS.includes(raw) ? raw : "7d";
  try {
    return NextResponse.json(
      { ...(await loadOverview(periodo)), podeAdministrar: isCamiAdmin(access.profile?.role, access.user.email) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("cami overview error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}
