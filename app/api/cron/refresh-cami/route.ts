/**
 * Cron – recalcula o resumo das conversas da Cami (CAMI Intelligence) e
 * confere no GHL se as passagens já foram respondidas.
 * Schedule: a cada 15 min, via vercel.json.
 */
import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/security/route-guards";
import { refreshCamiIntel } from "@/lib/ghl/ai-seller/intel-refresh";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;
  try {
    return NextResponse.json(await refreshCamiIntel());
  } catch (error) {
    console.error("cron refresh-cami error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}
