import { NextResponse } from "next/server";
import { mensagemDoTiny } from "@/lib/fluxo-caixa/regras";
import { buscarContatosTiny } from "@/lib/fluxo-caixa/tiny";
import { ADMIN_ROLES, requireRole } from "@/lib/security/route-guards";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const access = await requireRole(ADMIN_ROLES);
  if (!access.ok) return access.response;

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ contatos: [] });

  try {
    return NextResponse.json({ contatos: await buscarContatosTiny(q) });
  } catch (error) {
    console.error("[fluxo-caixa] busca de contatos falhou", error);
    return NextResponse.json({ error: mensagemDoTiny(error) }, { status: 502 });
  }
}
