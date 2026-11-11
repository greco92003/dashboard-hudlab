/**
 * Cron – atualiza a fila de Não lidas e avisa a Schay dos leads quentes com
 * mensagem nova (push + WhatsApp só para ela). Schedule: a cada 10 min, via
 * vercel.json. Fora do turno de quem recebe as passagens da Cami não faz nada
 * (nem gasta IA); a primeira rodada do turno pega o que chegou antes.
 * ?dryRun=1 atualiza a fila e mostra o aviso que sairia, sem enviar nem marcar.
 */
import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/security/route-guards";
import { escalationAvailability } from "@/lib/ghl/ai-seller/hours";
import { loadSellerSettings } from "@/lib/ghl/ai-seller/settings";
import { refreshUnreadInbox } from "@/lib/ghl/unread-inbox/refresh";
import { avisarLeadsQuentes } from "@/lib/ghl/unread-inbox/hot-alerts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;
  try {
    const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
    const settings = await loadSellerSettings();
    const turno = escalationAvailability(Date.now(), settings.shifts);
    if (!turno.available && !dryRun) {
      return NextResponse.json({ foraDoTurno: true, volta: turno.returnsAt });
    }
    const fila = await refreshUnreadInbox();
    const aviso = await avisarLeadsQuentes(settings, { dryRun });
    return NextResponse.json({ fila, aviso });
  } catch (error) {
    console.error("cron nao-lidas error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}
