import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/security/route-guards";
import { podeAdministrarHudIndica } from "@/lib/hud-indica/acesso";
import { carregarPainel } from "@/lib/hud-indica/servidor";

// Dados da página /indica. A chave Pix e as ações só vão para quem administra
// o programa (owner, team-leader e a Amanda).
export async function GET() {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;
  try {
    const painel = await carregarPainel(podeAdministrarHudIndica(access.profile?.role, access.user.email));
    return NextResponse.json(painel, { headers: { "Cache-Control": "no-store" } });
  } catch (erro) {
    console.error("hud-indica GET error:", erro);
    return NextResponse.json({ error: erro instanceof Error ? erro.message : "Erro interno" }, { status: 500 });
  }
}
