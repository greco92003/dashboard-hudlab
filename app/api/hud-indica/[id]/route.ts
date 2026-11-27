import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/security/route-guards";
import { podeAdministrarHudIndica } from "@/lib/hud-indica/acesso";
import { cancelarIndicacao, ErroHudIndica, marcarPixPago } from "@/lib/hud-indica/servidor";

// Ações da página /indica: marcar o Pix como pago (manda a M5 para quem
// indicou) e cancelar uma indicação (caso de dúvida, a Amanda decide).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;
  if (!podeAdministrarHudIndica(access.profile?.role, access.user.email)) {
    return NextResponse.json({ error: "Só a Amanda e os administradores mexem no Hud Indica" }, { status: 403 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Indicação inválida" }, { status: 400 });
  let corpo: { acao?: string; motivo?: string };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }
  try {
    if (corpo.acao === "pago") return NextResponse.json(await marcarPixPago(id, access.user.id));
    if (corpo.acao === "cancelar") {
      await cancelarIndicacao(id, String(corpo.motivo ?? ""));
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Ação desconhecida" }, { status: 400 });
  } catch (erro) {
    if (erro instanceof ErroHudIndica) return NextResponse.json({ error: erro.message }, { status: erro.status });
    console.error("hud-indica acao error:", { id, erro });
    return NextResponse.json({ error: erro instanceof Error ? erro.message : "Erro interno" }, { status: 500 });
  }
}
