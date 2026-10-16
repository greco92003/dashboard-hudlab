/**
 * Cron – revisão semanal do anexo de atendimento da Cami: com feedback na
 * fila, a IA reescreve o anexo e o dono recebe a revisão para aprovar.
 * Schedule: segunda 11:30 UTC (8h30 em Brasília), via vercel.json.
 */
import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/security/route-guards";
import { generateAnnexDraft } from "@/lib/ghl/ai-seller/annex";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;
  try {
    const rascunho = await generateAnnexDraft("semanal");
    return NextResponse.json(rascunho ? { gerado: true, id: rascunho.id, itens: rascunho.itens.length } : { gerado: false, motivo: "sem feedback na fila" });
  } catch (error) {
    console.error("cron cami-anexo-semanal error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}
