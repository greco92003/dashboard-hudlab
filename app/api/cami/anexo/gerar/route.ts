import { NextResponse } from "next/server";
import { requireRole } from "@/lib/security/route-guards";
import { generateAnnexDraft } from "@/lib/ghl/ai-seller/annex";

// "Gerar revisão agora": o dono não precisa esperar segunda.
export async function POST() {
  const access = await requireRole(["owner"]);
  if (!access.ok) return access.response;
  try {
    const rascunho = await generateAnnexDraft("manual");
    if (!rascunho) return NextResponse.json({ error: "Não há feedback na fila para revisar" }, { status: 409 });
    return NextResponse.json({ rascunho });
  } catch (error) {
    console.error("cami anexo gerar error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}
