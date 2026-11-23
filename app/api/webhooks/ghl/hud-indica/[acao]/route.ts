import { NextRequest, NextResponse } from "next/server";
import { verifyGhlWebhook } from "@/lib/ghl/webhook";
import {
  registrarChegada,
  registrarFechamento,
  registrarPagamentoIntegral,
  registrarResposta,
} from "@/lib/hud-indica/servidor";

// Webhooks do Hud Indica, chamados pelos workflows do GHL (Bearer com o
// segredo dos webhooks do GHL). Dados personalizados do webhook no workflow:
// contact_id = {{contact.id}}, opportunity_id = {{opportunity.id}} (quando
// houver) e resposta = o botão tocado na pesquisa.
//   POST /api/webhooks/ghl/hud-indica/resposta       pesquisa M0: grava a nota; "Nota 10!" cria o link
//   POST /api/webhooks/ghl/hud-indica/chegada        lead com o campo Afiliado: registra a indicação e manda a M3b
//   POST /api/webhooks/ghl/hud-indica/fechou         card com hud_indicado em Cadastro ERP: valida e manda a M4
//   POST /api/webhooks/ghl/hud-indica/pago-integral  card em Aprovar Financeiro Pedido Total: libera o Pix (50/50 e boleto)

export const dynamic = "force-dynamic";

const ACOES = ["resposta", "chegada", "fechou", "pago-integral"] as const;
type Acao = (typeof ACOES)[number];

function campo(payload: Record<string, unknown>, ...chaves: string[]): string | null {
  const customData = (payload.customData ?? {}) as Record<string, unknown>;
  for (const chave of chaves) {
    for (const valor of [customData[chave], payload[chave]]) {
      if (typeof valor === "string" && valor.trim()) return valor.trim();
    }
  }
  return null;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ acao: string }> }) {
  const { acao } = await params;
  if (!ACOES.includes(acao as Acao)) return NextResponse.json({ error: "Ação desconhecida" }, { status: 404 });

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

  const contactId = campo(payload, "contact_id", "contactId");
  if (!contactId) return NextResponse.json({ error: "contact_id ausente" }, { status: 400 });

  try {
    switch (acao as Acao) {
      case "resposta":
        return NextResponse.json(await registrarResposta(contactId, campo(payload, "resposta")));
      case "chegada":
        return NextResponse.json(await registrarChegada(contactId));
      case "fechou":
        return NextResponse.json(await registrarFechamento(contactId, campo(payload, "opportunity_id", "opportunityId")));
      case "pago-integral":
        return NextResponse.json(await registrarPagamentoIntegral(contactId));
    }
  } catch (erro) {
    console.error(`[Hud Indica] webhook ${acao} falhou`, { contactId, erro });
    return NextResponse.json({ error: erro instanceof Error ? erro.message : "Erro interno" }, { status: 502 });
  }
}
