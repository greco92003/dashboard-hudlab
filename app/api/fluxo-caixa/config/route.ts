import { NextResponse } from "next/server";
import { z } from "zod";
import { salvarSaldoInicial } from "@/lib/fluxo-caixa/repositorio";
import { ADMIN_ROLES, requireRole } from "@/lib/security/route-guards";

export const runtime = "nodejs";

const schema = z.object({
  valor: z.number().finite(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function PUT(request: Request) {
  const access = await requireRole(ADMIN_ROLES);
  if (!access.ok) return access.response;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Saldo inválido." }, { status: 400 });

  try {
    await salvarSaldoInicial(parsed.data, access.user.email ?? null);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[fluxo-caixa] salvar saldo falhou", error);
    return NextResponse.json({ error: "Não foi possível salvar o saldo inicial." }, { status: 500 });
  }
}
