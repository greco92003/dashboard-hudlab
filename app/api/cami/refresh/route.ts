import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/security/route-guards";
import { refreshCamiIntel } from "@/lib/ghl/ai-seller/intel-refresh";

// Botão Atualizar da CAMI Intelligence: o mesmo recálculo do cron, na hora.
export async function POST() {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;
  try {
    return NextResponse.json(await refreshCamiIntel());
  } catch (error) {
    console.error("cami refresh error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}
