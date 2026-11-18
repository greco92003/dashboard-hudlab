import { NextResponse } from "next/server";
import { cotarFreteDoPedido } from "@/lib/ghl/ficha-pedido/frete-servidor";
import { requireApprovedUser } from "@/lib/security/route-guards";

export const maxDuration = 60;

/** Cota o frete do pedido para o CEP do cadastro do cliente (da mais barata para a mais cara). */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;
  const { id } = await context.params;
  const corpo = (await request.json().catch(() => ({}))) as { pares?: unknown; valorNf?: unknown };
  const pares = Math.trunc(Number(corpo.pares));
  const valorNf = Number(corpo.valorNf);
  if (!Number.isFinite(pares) || pares <= 0) {
    return NextResponse.json({ error: "Informe a quantidade de pares." }, { status: 400 });
  }
  try {
    const cotacao = await cotarFreteDoPedido(id, pares, Number.isFinite(valorNf) && valorNf > 0 ? valorNf : 0);
    return NextResponse.json({ cotacao }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Cotação de frete da ficha falhou", error);
    return NextResponse.json({ error: "Não foi possível cotar o frete agora." }, { status: 502 });
  }
}
