import { NextResponse } from "next/server";
import { lerRascunhoFicha, prepararRascunhoFicha } from "@/lib/ghl/ficha-pedido/rascunhos";
import { requireApprovedUser } from "@/lib/security/route-guards";

// A Cami lê a conversa e as imagens: leva de 15 a 40 segundos.
export const maxDuration = 120;

const semCache = { "Cache-Control": "no-store" };

/** Rascunho da ficha do pedido montado pela Cami (ou null, se ainda não existe). */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;
  const { id } = await context.params;
  try {
    return NextResponse.json({ rascunho: await lerRascunhoFicha(id) }, { headers: semCache });
  } catch (error) {
    console.error("Leitura do rascunho da ficha falhou", error);
    return NextResponse.json({ error: "Não foi possível ler o rascunho da Cami." }, { status: 502, headers: semCache });
  }
}

/** Gera agora (ou refaz, com { refazer: true }) e devolve o rascunho. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;
  const { id } = await context.params;
  const corpo = (await request.json().catch(() => ({}))) as { refazer?: unknown };
  try {
    const resultado = await prepararRascunhoFicha(id, { forcar: corpo.refazer === true });
    return NextResponse.json({ resultado, rascunho: await lerRascunhoFicha(id) }, { headers: semCache });
  } catch (error) {
    console.error("Geração do rascunho da ficha falhou", error);
    return NextResponse.json({ error: "Não foi possível gerar o rascunho da Cami." }, { status: 502, headers: semCache });
  }
}
