import { NextResponse } from "next/server";
import { z } from "zod";
import {
  atualizarRecebimento,
  cancelarOrdemCompra,
  listarOrdensCompra,
} from "@/lib/estoque/ordem-compra";
import { invalidarCacheSolados } from "@/lib/estoque/solados-source";
import { requireApprovedUser } from "@/lib/security/route-guards";

const acaoSchema = z.union([
  z.object({ cancelar: z.literal(true) }),
  z.object({
    recebimentos: z
      .array(
        z.object({
          itemId: z.string().uuid(),
          // Acumulado, não incremento: a tela mostra o total já recebido.
          paresRecebidos: z.number().int().min(0).max(100_000),
        }),
      )
      .min(1)
      .max(18),
  }),
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const acesso = await requireApprovedUser();
  if (!acesso.ok) return acesso.response;

  const { id } = await params;
  const corpo = acaoSchema.safeParse(await request.json());
  if (!corpo.success) {
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  }

  try {
    if ("cancelar" in corpo.data) {
      await cancelarOrdemCompra(id);
    } else {
      // Recebimento não pode passar do pedido — o banco recusaria com uma
      // mensagem opaca, então a checagem acontece aqui, com o nome do item.
      const ordem = (await listarOrdensCompra()).find((o) => o.id === id);
      if (!ordem) {
        return NextResponse.json(
          { error: "Ordem de compra não encontrada." },
          { status: 404 },
        );
      }
      for (const recebimento of corpo.data.recebimentos) {
        const item = ordem.itens.find((i) => i.id === recebimento.itemId);
        if (!item) {
          return NextResponse.json(
            { error: "Item não pertence a esta ordem de compra." },
            { status: 400 },
          );
        }
        if (recebimento.paresRecebidos > item.paresPedidos) {
          return NextResponse.json(
            {
              error:
                `${item.cor} ${item.numeracao}: recebido ${recebimento.paresRecebidos} ` +
                `é maior que os ${item.paresPedidos} pedidos.`,
            },
            { status: 400 },
          );
        }
      }
      for (const recebimento of corpo.data.recebimentos) {
        await atualizarRecebimento(
          recebimento.itemId,
          recebimento.paresRecebidos,
        );
      }
    }

    invalidarCacheSolados();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Falha ao atualizar ordem de compra", error);
    return NextResponse.json(
      { error: "Não foi possível atualizar a ordem de compra." },
      { status: 502 },
    );
  }
}
