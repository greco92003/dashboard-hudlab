import { NextResponse } from "next/server";
import { getTinyExistingProduct } from "@/lib/erp/tiny-existing-product-v2";
import { requireAdmin } from "@/lib/security/route-guards";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireAdmin();
  if (!access.ok) return access.response;
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Produto inválido." }, { status: 400 });
  }

  try {
    return NextResponse.json({ product: await getTinyExistingProduct(id) });
  } catch (error) {
    console.error("ERP Tiny product detail failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível obter o produto no Tiny." },
      { status: 502 },
    );
  }
}
