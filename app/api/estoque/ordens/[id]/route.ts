import { after, NextResponse } from "next/server";
import { z } from "zod";
import { cancelarOrdemCompra } from "@/lib/estoque/ordem-compra-source";
import { atualizarTinySolados } from "@/lib/estoque/solados-source";
import { COMPRAS_ROLES, requireRole } from "@/lib/security/route-guards";

// A releitura do Tiny roda depois da resposta (`after`) e cabe aqui.
export const maxDuration = 300;


const acaoSchema = z.object({ cancelar: z.literal(true) });

/**
 * Só cancelamento. O recebimento não se lança aqui: ele vem da nota fiscal
 * vinculada à ordem no Tiny, para não existirem duas versões do que chegou.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const acesso = await requireRole(COMPRAS_ROLES);
  if (!acesso.ok) return acesso.response;

  const { id } = await params;
  const numero = Number(id);
  if (!Number.isInteger(numero) || numero <= 0) {
    return NextResponse.json(
      { error: "Ordem de compra inválida." },
      { status: 400 },
    );
  }

  if (!acaoSchema.safeParse(await request.json()).success) {
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  }

  try {
    await cancelarOrdemCompra(numero);
    // A OC mudou: relê saldo e "a caminho" do Tiny para a tela de estoque, em
    // segundo plano. A falha fica no log; a próxima abertura da tela relê.
    after(() =>
      atualizarTinySolados({ evento: true }).catch((error) =>
        console.error("Estoque de solados: releitura do Tiny falhou", error),
      ),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Falha ao cancelar ordem de compra no Tiny", error);
    return NextResponse.json(
      { error: "O Tiny recusou o cancelamento." },
      { status: 502 },
    );
  }
}
