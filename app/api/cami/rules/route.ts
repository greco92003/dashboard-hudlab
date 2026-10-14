import { NextResponse } from "next/server";
import { requireApprovedUser, requireRole } from "@/lib/security/route-guards";
import { createRule, listReferences, listRules, RuleError } from "@/lib/ghl/ai-seller/rules";
import { MAX_ACTIVE_RULES } from "@/lib/ghl/ai-seller/rules-shape";

// Regras da casa e conversas de referência. Todo o time vê; só o owner muda.
export async function GET() {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;
  try {
    const [rules, references] = await Promise.all([listRules(), listReferences()]);
    return NextResponse.json(
      {
        rules,
        references: references.map((r) => ({
          id: r.id,
          nome: r.nome,
          boaResposta: r.boaResposta,
          contactId: r.contactId,
          createdAt: r.createdAt,
          stageName: r.context.stageName,
          at: r.context.at,
          cliente: [...r.messages].reverse().find((m) => m.direction === "inbound")?.body ?? null,
          mensagens: r.messages.length,
        })),
        maxAtivas: MAX_ACTIVE_RULES,
        podeEditar: access.profile?.role === "owner",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("cami rules list error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await requireRole(["owner"]);
  if (!access.ok) return access.response;
  const body = (await request.json().catch(() => null)) as
    | { texto?: unknown; ativa?: unknown; origem?: unknown; contactId?: unknown }
    | null;
  try {
    const rule = await createRule({
      texto: body?.texto,
      ativa: body?.ativa === true,
      origem: body?.origem === "correcao" || body?.origem === "sugestao" ? body.origem : "manual",
      contactId: typeof body?.contactId === "string" ? body.contactId : null,
      userId: access.user.id,
    });
    return NextResponse.json({ rule });
  } catch (error) {
    if (error instanceof RuleError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("cami rule create error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}
