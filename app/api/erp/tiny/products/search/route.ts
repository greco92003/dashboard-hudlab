import { NextResponse } from "next/server";
import { searchTinyExistingProducts } from "@/lib/erp/tiny-existing-product-v2";
import { requireApprovedUser } from "@/lib/security/route-guards";

export async function GET(request: Request) {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) {
    return NextResponse.json({ error: "Digite pelo menos 2 caracteres." }, { status: 400 });
  }

  try {
    return NextResponse.json({ products: await searchTinyExistingProducts(query) });
  } catch (error) {
    console.error("ERP Tiny product search failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível pesquisar produtos no Tiny." },
      { status: 502 },
    );
  }
}
