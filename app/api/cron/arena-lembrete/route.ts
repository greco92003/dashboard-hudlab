/**
 * Cron – lembrete de treino da Arena para quem ainda não treinou no dia.
 * Schedule: 18:00 UTC (15h em Brasília), segunda a sexta, via vercel.json.
 */
import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/security/route-guards";
import { sendTrainingReminders } from "@/lib/sellers-v2/reminder";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;
  try {
    return NextResponse.json(await sendTrainingReminders());
  } catch (error) {
    console.error("cron arena-lembrete error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}
