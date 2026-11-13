import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/security/route-guards";
import { atualizarPainelDeFechamento } from "@/lib/fechamento/refresh";

// Botão Atualizar do painel de fechamento: a mesma leitura do cron, na hora.
export async function POST() {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;
  try {
    return NextResponse.json(await atualizarPainelDeFechamento());
  } catch (error) {
    console.error("fechamento atualizar error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}
