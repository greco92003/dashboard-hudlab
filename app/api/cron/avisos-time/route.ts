/**
 * Cron – cliques nos botões das campanhas e pedidos de atendimento no Direct
 * (Instagram e Facebook) sem resposta do time viram aviso no WhatsApp da
 * Schay e do owner. Schedule: a cada 5 min, via vercel.json; fora
 * das 8h–21h (Brasília) não faz nada, e o primeiro do dia pega a noite.
 * ?dryRun=1 mostra o aviso que sairia, sem gravar nem enviar.
 */
import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/security/route-guards";
import { avisarCliquesSemResposta } from "@/lib/ghl/team-alerts/cliques";
import { avisarPedidosNoDirect } from "@/lib/ghl/team-alerts/direct";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;
  try {
    const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
    const agora = Date.now();
    // O Direct primeiro: ele lê a última execução que os cliques gravam no fim.
    // Um depois do outro, porque os dois dividem o limite de rajada do GHL.
    const direct = await avisarPedidosNoDirect(agora, { dryRun });
    const cliques = await avisarCliquesSemResposta(agora, { dryRun });
    return NextResponse.json({ ...cliques, direct });
  } catch (error) {
    console.error("cron avisos-time error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}
