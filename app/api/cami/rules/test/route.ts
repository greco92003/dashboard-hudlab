import { NextResponse } from "next/server";
import { requireRole } from "@/lib/security/route-guards";
import { RuleError } from "@/lib/ghl/ai-seller/rules";
import { testRule } from "@/lib/ghl/ai-seller/simulate";

// "Testar antes de ligar": a Cami responde às referências com e sem a regra,
// em modo de teste (nada é enviado ao cliente nem gravado no CRM).
export async function POST(request: Request) {
  const access = await requireRole(["owner"]);
  if (!access.ok) return access.response;
  const body = (await request.json().catch(() => null)) as
    | { texto?: unknown; referenceIds?: unknown; replaceRuleText?: unknown }
    | null;
  try {
    const items = await testRule({
      texto: body?.texto,
      referenceIds: Array.isArray(body?.referenceIds) ? body.referenceIds.filter((x): x is string => typeof x === "string") : undefined,
      replaceRuleText: typeof body?.replaceRuleText === "string" ? body.replaceRuleText : null,
    });
    return NextResponse.json({ items });
  } catch (error) {
    if (error instanceof RuleError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("cami rule test error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}
