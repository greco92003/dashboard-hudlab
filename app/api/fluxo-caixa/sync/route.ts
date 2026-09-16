import { NextResponse } from "next/server";
import { SyncEmAndamentoError } from "@/lib/fluxo-caixa/repositorio";
import { sincronizarFluxoCaixa } from "@/lib/fluxo-caixa/sync";
import { ADMIN_ROLES, requireRole } from "@/lib/security/route-guards";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  const access = await requireRole(ADMIN_ROLES);
  if (!access.ok) return access.response;

  try {
    return NextResponse.json(await sincronizarFluxoCaixa("manual"));
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : String(error);
    if (error instanceof SyncEmAndamentoError) {
      return NextResponse.json({ error: mensagem }, { status: 409 });
    }
    console.error("[fluxo-caixa] sync manual falhou", error);
    return NextResponse.json({ error: mensagem }, { status: 502 });
  }
}
