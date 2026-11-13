/**
 * Cron – atualiza o painel de fechamento (cards de Quero aproveitar, Prioridade
 * de Fechamento e Finalizando Venda) e as tarefas de follow-up no GHL.
 * Schedule: minutos 1, 11, 21, 31, 41 e 51 (vercel.json), longe das outras
 * rotinas que leem o GHL. Fora do turno não faz nada; ?forcar=1 roda mesmo assim.
 */
import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/security/route-guards";
import { escalationAvailability } from "@/lib/ghl/ai-seller/hours";
import { loadSellerSettings } from "@/lib/ghl/ai-seller/settings";
import { atualizarPainelDeFechamento } from "@/lib/fechamento/refresh";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;
  try {
    const forcar = new URL(request.url).searchParams.get("forcar") === "1";
    const settings = await loadSellerSettings();
    const turno = escalationAvailability(Date.now(), settings.shifts);
    if (!turno.available && !forcar) {
      return NextResponse.json({ foraDoTurno: true, volta: turno.returnsAt });
    }
    return NextResponse.json(await atualizarPainelDeFechamento());
  } catch (error) {
    console.error("cron fechamento error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}
