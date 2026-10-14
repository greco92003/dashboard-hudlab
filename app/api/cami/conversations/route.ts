import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/security/route-guards";
import { loadConversations } from "@/lib/ghl/ai-seller/intel-load";

// Conversas da Cami (uma linha por oportunidade assumida), do resumo que o cron atualiza.
export async function GET() {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;
  try {
    return NextResponse.json({ items: await loadConversations() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("cami conversations error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}
