import { NextResponse } from "next/server";
import { z } from "zod";
import { formatarDataTiny, mensagemDoTiny } from "@/lib/fluxo-caixa/regras";
import { atualizarContaNoEspelho } from "@/lib/fluxo-caixa/sync";
import { baixarContaTiny, type BaixaTiny } from "@/lib/fluxo-caixa/tiny";
import { ADMIN_ROLES, requireRole } from "@/lib/security/route-guards";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  tipo: z.enum(["pagar", "receber"]),
  tinyId: z.number().int().positive(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  valorPago: z.number().positive(),
  contaFinanceiraId: z.number().int().positive().optional(),
  juros: z.number().min(0).default(0),
  desconto: z.number().min(0).default(0),
});

/** Dá baixa (total ou parcial) numa conta do Tiny e atualiza o espelho. */
export async function POST(request: Request) {
  const access = await requireRole(ADMIN_ROLES);
  if (!access.ok) return access.response;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados da baixa inválidos." }, { status: 400 });
  const d = parsed.data;

  const baixa: BaixaTiny = {
    data: formatarDataTiny(d.data),
    valorPago: d.valorPago,
    juros: d.juros,
    desconto: d.desconto,
    ...(d.contaFinanceiraId
      ? d.tipo === "pagar"
        ? { contaOrigem: { id: d.contaFinanceiraId } }
        : { contaDestino: { id: d.contaFinanceiraId } }
      : {}),
  };

  try {
    await baixarContaTiny(d.tipo, d.tinyId, baixa);
  } catch (error) {
    console.error("[fluxo-caixa] baixa falhou", error);
    return NextResponse.json({ error: mensagemDoTiny(error) }, { status: 502 });
  }

  try {
    await atualizarContaNoEspelho(d.tipo, d.tinyId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.warn("[fluxo-caixa] baixa feita, espelho não atualizado", error);
    return NextResponse.json({ ok: true, aviso: "Baixa feita no Tiny; a tela atualiza na próxima sincronização." });
  }
}
