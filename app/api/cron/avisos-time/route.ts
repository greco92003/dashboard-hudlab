/**
 * Cron – cliques nos botões das campanhas sem resposta do time viram aviso no
 * WhatsApp da Schay e do owner. Schedule: a cada 5 min, via vercel.json; fora
 * das 8h–21h (Brasília) não faz nada, e o primeiro do dia pega a noite.
 * ?dryRun=1 mostra o aviso que sairia, sem gravar nem enviar.
 */
import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/security/route-guards";
import { avisarCliquesSemResposta } from "@/lib/ghl/team-alerts/cliques";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;
  try {
    const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
    return NextResponse.json(await avisarCliquesSemResposta(Date.now(), { dryRun }));
  } catch (error) {
    console.error("cron avisos-time error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}
