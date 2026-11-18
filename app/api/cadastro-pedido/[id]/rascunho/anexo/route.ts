import { NextResponse } from "next/server";
import { downloadGhlMedia } from "@/lib/ghl/mockup-instructions/ghl-client";
import { lerRascunhoFicha } from "@/lib/ghl/ficha-pedido/rascunhos";
import { requireApprovedUser } from "@/lib/security/route-guards";

/**
 * Baixa um comprovante que a Cami achou na conversa, para o formulário anexar
 * como arquivo. Só serve links que estão no rascunho deste negócio: nada de
 * buscar endereço qualquer pelo servidor.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;
  const { id } = await context.params;
  const url = new URL(request.url).searchParams.get("url") ?? "";
  const estado = await lerRascunhoFicha(id).catch(() => null);
  if (!url || !estado?.rascunho?.comprovanteUrls.includes(url)) {
    return NextResponse.json({ error: "Comprovante não encontrado no rascunho." }, { status: 404 });
  }
  const midia = await downloadGhlMedia(url);
  if (!midia) return NextResponse.json({ error: "Não foi possível baixar o comprovante." }, { status: 502 });
  return new NextResponse(new Uint8Array(midia.bytes), {
    headers: {
      "Content-Type": midia.mimeType,
      "X-Nome-Arquivo": encodeURIComponent(midia.filename),
      "Cache-Control": "no-store",
    },
  });
}
