import { after, NextResponse } from "next/server";
import { z } from "zod";
import {
  criarOrdemCompra,
  lerCompras,
} from "@/lib/estoque/ordem-compra-source";
import { atualizarTinySolados } from "@/lib/estoque/solados-source";
import {
  COMPRAS_ROLES,
  requireApprovedUser,
  requireRole,
} from "@/lib/security/route-guards";

// A releitura do Tiny roda depois da resposta (`after`) e cabe aqui.
export const maxDuration = 300;

/**
 * A OC mudou: relê saldo e "a caminho" do Tiny para a tela de estoque. Em
 * segundo plano, para não segurar a resposta; a falha fica no log, e a próxima
 * abertura da tela ou o botão Atualizar relê.
 */
function releTinySolados() {
  after(() =>
    atualizarTinySolados({ evento: true }).catch((error) =>
      console.error("Estoque de solados: releitura do Tiny falhou", error),
    ),
  );
}

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
    const { ordens, consolidado } = await lerCompras();
    return NextResponse.json({ ordens, consolidado });
  } catch (error) {
    console.error("Falha ao listar ordens de compra no Tiny", error);
    return NextResponse.json(
      { error: "Não foi possível carregar as ordens de compra." },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const acesso = await requireRole(COMPRAS_ROLES);
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
    releTinySolados();
    return NextResponse.json({ ordem }, { status: 201 });
  } catch (error) {
    console.error("Falha ao criar ordem de compra no Tiny", error);
    return NextResponse.json(
      { error: "O Tiny recusou a ordem de compra." },
      { status: 502 },
    );
  }
}
