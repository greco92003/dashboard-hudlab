import { NextResponse } from "next/server";
import { z } from "zod";
import {
  criarOrdemCompra,
  listarOrdensCompra,
} from "@/lib/estoque/ordem-compra-source";
import { invalidarCacheSolados } from "@/lib/estoque/solados-source";
import { requireApprovedUser, requireRole } from "@/lib/security/route-guards";

/**
 * Criar ordem de compra é compromisso financeiro com fornecedor, e sai daqui
 * direto para o Tiny. Fica restrito a quem responde por isso; ler é liberado
 * para qualquer usuário aprovado.
 */
const PAPEIS_QUE_COMPRAM = ["owner", "admin"] as const;

const novaOrdemSchema = z.object({
  dataPrevista: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  observacoes: z.string().trim().max(500).nullish(),
  itens: z
    .array(
      z.object({
        produtoId: z.number().int().positive(),
        quantidade: z.number().int().positive().max(100_000),
        valor: z.number().nonnegative().max(100_000),
      }),
    )
    .min(1)
    .max(18),
});

export async function GET() {
  const acesso = await requireApprovedUser();
  if (!acesso.ok) return acesso.response;

  try {
    return NextResponse.json({ ordens: await listarOrdensCompra() });
  } catch (error) {
    console.error("Falha ao listar ordens de compra no Tiny", error);
    return NextResponse.json(
      { error: "Não foi possível carregar as ordens de compra." },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const acesso = await requireRole(PAPEIS_QUE_COMPRAM);
  if (!acesso.ok) return acesso.response;

  const corpo = novaOrdemSchema.safeParse(await request.json());
  if (!corpo.success) {
    return NextResponse.json(
      { error: "Dados inválidos para a ordem de compra." },
      { status: 400 },
    );
  }

  // O mesmo produto duas vezes viraria duas linhas na OC do Tiny.
  const ids = corpo.data.itens.map((item) => item.produtoId);
  if (new Set(ids).size !== ids.length) {
    return NextResponse.json(
      { error: "Há produtos repetidos na ordem." },
      { status: 400 },
    );
  }

  try {
    const ordem = await criarOrdemCompra(corpo.data);
    invalidarCacheSolados();
    return NextResponse.json({ ordem }, { status: 201 });
  } catch (error) {
    console.error("Falha ao criar ordem de compra no Tiny", error);
    return NextResponse.json(
      { error: "O Tiny recusou a ordem de compra." },
      { status: 502 },
    );
  }
}
