import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/security/route-guards";
import { cotarFretePorDestino } from "@/lib/ghl/ficha-pedido/frete-servidor";

// Cotação de frete pelo CEP para a aba Mensagens do Fechamento: a Schay digita
// o CEP do cliente e o orçamento usa o frete real no lugar da estimativa pelo
// estado. Mesma cotação da ficha do pedido e da Cami.
// GET /api/fechamento/frete?cep=50000000&pares=30&valor=1650
export async function GET(request: NextRequest) {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;

  const params = request.nextUrl.searchParams;
  const cep = (params.get("cep") ?? "").replace(/\D/g, "");
  const pares = Math.trunc(Number(params.get("pares")));
  const valor = Number(params.get("valor"));
  if (cep.length !== 8) return NextResponse.json({ error: "CEP com 8 dígitos" }, { status: 400 });
  if (!Number.isFinite(pares) || pares < 1 || pares > 5000) {
    return NextResponse.json({ error: "Quantidade de pares inválida" }, { status: 400 });
  }

  try {
    const cotacao = await cotarFretePorDestino(cep, pares, Number.isFinite(valor) && valor > 0 ? valor : 0);
    return NextResponse.json(cotacao, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("fechamento frete GET error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}
