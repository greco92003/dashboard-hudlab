import { NextResponse } from "next/server";
import { z } from "zod";
import {
  agrupamentoAutomatico,
  contasDoPeriodo,
  hojeEmSaoPaulo,
  montarFluxo,
  type RespostaFluxo,
} from "@/lib/fluxo-caixa/regras";
import { lerContas, lerSaldoInicial, lerUltimasSyncs } from "@/lib/fluxo-caixa/repositorio";
import { ADMIN_ROLES, requireRole } from "@/lib/security/route-guards";

export const runtime = "nodejs";

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const schema = z.object({
  inicio: z.string().regex(DATA),
  fim: z.string().regex(DATA),
  agrupamento: z.enum(["dia", "semana", "mes"]).optional(),
});

export async function GET(request: Request) {
  const access = await requireRole(ADMIN_ROLES);
  if (!access.ok) return access.response;

  const parsed = schema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success || parsed.data.fim < parsed.data.inicio) {
    return NextResponse.json({ error: "Período inválido." }, { status: 400 });
  }
  const { inicio, fim } = parsed.data;
  const agrupamento = parsed.data.agrupamento ?? agrupamentoAutomatico(inicio, fim);

  try {
    const hoje = hojeEmSaoPaulo();
    const [contas, saldoInicial, syncs] = await Promise.all([
      lerContas(),
      lerSaldoInicial(),
      lerUltimasSyncs(),
    ]);
    const { pontos, resumo } = montarFluxo({ contas, inicio, fim, agrupamento, hoje, saldoInicial });
    const resposta: RespostaFluxo = {
      hoje,
      inicio,
      fim,
      agrupamento,
      pontos,
      resumo,
      contas: contasDoPeriodo(contas, inicio, fim, hoje),
      saldoInicial,
      ultimaSync: syncs.ultima,
      ultimaSyncOk: syncs.ultimaOk,
    };
    return NextResponse.json(resposta, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[fluxo-caixa] leitura falhou", error);
    return NextResponse.json({ error: "Não foi possível ler o fluxo de caixa." }, { status: 500 });
  }
}
