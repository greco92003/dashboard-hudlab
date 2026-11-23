import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/security/route-guards";
import { dadosDoClienteParaMensagens } from "@/lib/fechamento/cliente";

// CEP, estado e pares do cliente para a aba Mensagens do Fechamento, quando a
// Schay abre a aba pelo botão do card.
// GET /api/fechamento/<opportunityId>/cliente
export async function GET(_request: Request, { params }: { params: Promise<{ opportunityId: string }> }) {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;
  const { opportunityId } = await params;
  if (!/^[A-Za-z0-9]{10,40}$/.test(opportunityId)) {
    return NextResponse.json({ error: "Oportunidade inválida" }, { status: 400 });
  }
  try {
    const dados = await dadosDoClienteParaMensagens(opportunityId);
    return NextResponse.json(dados, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("fechamento cliente GET error:", { opportunityId, error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}
