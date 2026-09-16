import { NextResponse } from "next/server";
import { z } from "zod";
import {
  generateProductionOrder,
  loadProductionOrderPreview,
  ProductionOrderAlreadyGenerated,
  readRecord,
} from "@/lib/erp/tiny-production-order";
import { requireApprovedUser } from "@/lib/security/route-guards";

export const runtime = "nodejs";
export const maxDuration = 120;

type Context = { params: Promise<{ id: string }> };

async function orderIdFrom(context: Context) {
  const orderId = Number((await context.params).id);
  return Number.isInteger(orderId) && orderId > 0 ? orderId : null;
}

export async function GET(request: Request, context: Context) {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;
  const orderId = await orderIdFrom(context);
  if (!orderId) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });

  // Só o registro: o botão mostra "OP gerada" sem ir ao Tiny a cada render.
  if (new URL(request.url).searchParams.get("registro") === "1") {
    try {
      return NextResponse.json({ record: await readRecord(orderId) }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      console.error("ERP production order record read failed", error);
      return NextResponse.json({ error: "Não foi possível ler o registro da OP." }, { status: 502 });
    }
  }

  try {
    return NextResponse.json(await loadProductionOrderPreview(orderId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("ERP production order preview failed", error);
    return NextResponse.json({ error: "Não foi possível carregar os itens do pedido no Tiny." }, { status: 502 });
  }
}

const schema = z.object({ force: z.boolean().default(false) });

export async function POST(request: Request, context: Context) {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;
  const orderId = await orderIdFrom(context);
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!orderId || !parsed.success) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });

  try {
    const result = await generateProductionOrder(orderId, {
      force: parsed.data.force,
      userEmail: access.user.email ?? null,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ProductionOrderAlreadyGenerated) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("ERP production order generation failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível gerar a ordem de produção." },
      { status: 502 },
    );
  }
}
