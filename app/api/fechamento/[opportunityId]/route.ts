import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/security/route-guards";
import { ErroDeAcao, executarAcao, type Acao } from "@/lib/fechamento/acoes";

const ACOES: readonly Acao[] = ["contato", "adiar", "modelo", "perdido", "fechou"];

// Botões do card: Fiz contato, Adiar, Mandar modelo, Perdido e Fechou.
export async function POST(request: Request, { params }: { params: Promise<{ opportunityId: string }> }) {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;
  const { opportunityId } = await params;
  let corpo: { acao?: string; motivo?: string; ate?: string };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }
  if (!corpo.acao || !ACOES.includes(corpo.acao as Acao)) {
    return NextResponse.json({ error: "Ação desconhecida" }, { status: 400 });
  }
  try {
    const resultado = await executarAcao(opportunityId, corpo.acao as Acao, {
      motivo: corpo.motivo,
      ate: corpo.ate,
      userId: access.user.id,
    });
    return NextResponse.json(resultado);
  } catch (error) {
    if (error instanceof ErroDeAcao) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("fechamento acao error:", { opportunityId, error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}
