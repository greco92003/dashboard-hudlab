/**
 * Cron – espelha contas a pagar/receber do Tiny em fin_contas.
 * Schedule: a cada 15 minutos (vercel.json).
 */

import { NextResponse } from "next/server";
import { SyncEmAndamentoError } from "@/lib/fluxo-caixa/repositorio";
import { sincronizarFluxoCaixa } from "@/lib/fluxo-caixa/sync";
import { requireCronSecret } from "@/lib/security/route-guards";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const authError = requireCronSecret(request);
  if (authError) return authError;

  try {
    return NextResponse.json({ ok: true, ...(await sincronizarFluxoCaixa("cron")) });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : String(error);
    if (error instanceof SyncEmAndamentoError) {
      return NextResponse.json({ ok: false, skipped: true, error: mensagem });
    }
    console.error("[cron/sync-fluxo-caixa]", mensagem);
    return NextResponse.json({ ok: false, error: mensagem }, { status: 500 });
  }
}
