import { NextResponse } from "next/server";
import { z } from "zod";
import { mensagemDoTiny } from "@/lib/fluxo-caixa/regras";
import { atualizarContaNoEspelho } from "@/lib/fluxo-caixa/sync";
import { criarContaPagarTiny, type NovaContaPagarTiny } from "@/lib/fluxo-caixa/tiny";
import { ADMIN_ROLES, requireRole } from "@/lib/security/route-guards";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z
  .object({
    historico: z.string().trim().min(1).max(250),
    contatoId: z.number().int().positive(),
    categoriaId: z.number().int().positive().optional(),
    dataVencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    valor: z.number().positive(),
    numeroDocumento: z.string().trim().max(60).optional(),
    ocorrencia: z.enum(["U", "M", "P"]).default("U"),
    quantidadeParcelas: z.number().int().min(2).max(120).optional(),
  })
  .refine((d) => d.ocorrencia !== "P" || d.quantidadeParcelas, {
    message: "Informe a quantidade de parcelas.",
  });

/** Lança uma saída manual como conta a pagar no Tiny. */
export async function POST(request: Request) {
  const access = await requireRole(ADMIN_ROLES);
  if (!access.ok) return access.response;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }
  const d = parsed.data;
  const conta: NovaContaPagarTiny = {
    dataVencimento: d.dataVencimento,
    valor: d.valor,
    contato: { id: d.contatoId },
    historico: d.historico,
    ocorrencia: d.ocorrencia,
    ...(d.categoriaId ? { categoria: { id: d.categoriaId } } : {}),
    ...(d.numeroDocumento ? { numeroDocumento: d.numeroDocumento } : {}),
    ...(d.ocorrencia === "M" ? { diaVencimento: Number(d.dataVencimento.slice(8, 10)) } : {}),
    ...(d.ocorrencia === "P" ? { quantidadeParcelas: d.quantidadeParcelas } : {}),
  };

  let id: number;
  try {
    id = await criarContaPagarTiny(conta);
  } catch (error) {
    console.error("[fluxo-caixa] criar conta a pagar falhou", error);
    return NextResponse.json({ error: mensagemDoTiny(error) }, { status: 502 });
  }

  let aviso: string | undefined =
    d.ocorrencia === "U" ? undefined : "As demais ocorrências aparecem na próxima sincronização.";
  try {
    await atualizarContaNoEspelho("pagar", id);
  } catch (error) {
    console.warn("[fluxo-caixa] conta criada, espelho não atualizado", error);
    aviso = "Conta criada no Tiny; ela aparece aqui na próxima sincronização.";
  }
  return NextResponse.json({ id, aviso });
}
