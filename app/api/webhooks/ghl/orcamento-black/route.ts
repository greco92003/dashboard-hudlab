import { NextRequest, NextResponse } from "next/server";
import { verifyGhlWebhook } from "@/lib/ghl/webhook";
import { orcamentoBlackDoContato } from "@/lib/ghl/orcamento-black/send";

// Orçamento da Black November. O ramo Black do "Orçamento Automático 03" chama
// este webhook (Bearer com o segredo dos webhooks do GHL) depois de gravar o
// frete; aqui o orçamento é calculado e gravado no contato, e o workflow manda
// o campo "Black Orçamento Texto" na mensagem. ?dryRun=1 só calcula.

export const dynamic = "force-dynamic";

function contactIdDo(payload: Record<string, unknown>): string | null {
  const customData = (payload.customData ?? {}) as Record<string, unknown>;
  for (const valor of [customData.contact_id, payload.contact_id, payload.contactId]) {
    if (typeof valor === "string" && valor.trim()) return valor.trim();
  }
  return null;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!verifyGhlWebhook(rawBody, request.headers)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const contactId = contactIdDo(payload);
  if (!contactId) return NextResponse.json({ error: "contact_id ausente" }, { status: 400 });

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
  try {
    const resultado = await orcamentoBlackDoContato(contactId, { dryRun });
    if (!resultado.ok) {
      console.warn("[Orçamento Black] contato sem quantidade de pares", { contactId, pares: resultado.pares });
      return NextResponse.json({ error: "Qntd Pares ausente ou inválida", contactId }, { status: 422 });
    }
    return NextResponse.json({ contactId, gravado: resultado.gravado, orcamento: resultado.orcamento });
  } catch (err) {
    console.error("[Orçamento Black] falha ao calcular ou gravar", { contactId, err });
    return NextResponse.json({ error: "Falha ao falar com o GHL" }, { status: 502 });
  }
}
