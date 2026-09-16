import { NextResponse } from "next/server";
import { mensagemDoTiny } from "@/lib/fluxo-caixa/regras";
import { listarCategoriasTiny, listarContasFinanceirasTiny } from "@/lib/fluxo-caixa/tiny";
import { ADMIN_ROLES, requireRole } from "@/lib/security/route-guards";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Categorias de receita/despesa e contas financeiras do Tiny para os formulários. */
export async function GET() {
  const access = await requireRole(ADMIN_ROLES);
  if (!access.ok) return access.response;

  try {
    const categorias = await listarCategoriasTiny();
    const contasFinanceiras = await listarContasFinanceirasTiny();
    return NextResponse.json({ categorias, contasFinanceiras });
  } catch (error) {
    console.error("[fluxo-caixa] opções do Tiny falharam", error);
    return NextResponse.json({ error: mensagemDoTiny(error) }, { status: 502 });
  }
}
