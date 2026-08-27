import { NextResponse } from "next/server";
import { z } from "zod";
import {
  criarOrdemCompra,
  listarOrdensCompra,
} from "@/lib/estoque/ordem-compra";
import { invalidarCacheSolados } from "@/lib/estoque/solados-source";
import { SOLADO_CORES } from "@/lib/estoque/solados";
import { requireApprovedUser } from "@/lib/security/route-guards";

const NUMERACAO = /^\d{2}\/\d{2}$/;

const novaOrdemSchema = z.object({
  numero: z.string().trim().max(30).nullish(),
  fornecedor: z.string().trim().min(1).max(80).default("INPU"),
  emitidaEm: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  previstaPara: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  observacao: z.string().trim().max(500).nullish(),
  itens: z
    .array(
      z.object({
        cor: z.enum(SOLADO_CORES),
        numeracao: z.string().regex(NUMERACAO),
        paresPedidos: z.number().int().positive().max(100_000),
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
    console.error("Falha ao listar ordens de compra", error);
    return NextResponse.json(
      { error: "Não foi possível carregar as ordens de compra." },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const acesso = await requireApprovedUser();
  if (!acesso.ok) return acesso.response;

  const corpo = novaOrdemSchema.safeParse(await request.json());
  if (!corpo.success) {
    return NextResponse.json(
      { error: "Dados inválidos para a ordem de compra." },
      { status: 400 },
    );
  }

  // Duas linhas para a mesma cor e numeração violariam a restrição do banco
  // com uma mensagem que não ajuda ninguém.
  const chaves = corpo.data.itens.map((i) => `${i.cor} ${i.numeracao}`);
  if (new Set(chaves).size !== chaves.length) {
    return NextResponse.json(
      { error: "Há numerações repetidas na mesma cor." },
      { status: 400 },
    );
  }

  try {
    const ordem = await criarOrdemCompra({
      ...corpo.data,
      criadaPor: acesso.user.id,
    });
    invalidarCacheSolados();
    return NextResponse.json({ ordem }, { status: 201 });
  } catch (error) {
    console.error("Falha ao criar ordem de compra", error);
    return NextResponse.json(
      { error: "Não foi possível criar a ordem de compra." },
      { status: 502 },
    );
  }
}
