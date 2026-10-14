import { NextResponse } from "next/server";
import { requireRole } from "@/lib/security/route-guards";
import { createReferenceFromContact, RuleError } from "@/lib/ghl/ai-seller/rules";
import { parseGhlContactId } from "@/lib/ghl/ai-seller/rules-shape";

// Guarda uma conversa de referência a partir de um contato do GHL (ID ou link). Só owner.
export async function POST(request: Request) {
  const access = await requireRole(["owner"]);
  if (!access.ok) return access.response;
  const body = (await request.json().catch(() => null)) as
    | { contato?: unknown; nome?: unknown; boaResposta?: unknown }
    | null;
  const contactId = parseGhlContactId(body?.contato);
  if (!contactId) {
    return NextResponse.json({ error: "Cole o ID do contato ou o link do contato no GHL" }, { status: 400 });
  }
  try {
    const reference = await createReferenceFromContact({
      contactId,
      nome: body?.nome,
      boaResposta: body?.boaResposta,
      userId: access.user.id,
    });
    return NextResponse.json({ reference: { id: reference.id, nome: reference.nome } });
  } catch (error) {
    if (error instanceof RuleError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("cami reference create error:", { contactId, error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}
