/**
 * Cron – resumo do dia da Cami para o owner, por push e no sininho.
 * Schedule: 21:30 UTC (18h30 em Brasília), segunda a sexta, via vercel.json.
 */
import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/security/route-guards";
import { sendDailySummary } from "@/lib/ghl/ai-seller/alerts-send";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;
  try {
    return NextResponse.json(await sendDailySummary());
  } catch (error) {
    console.error("cron cami-resumo-diario error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}
