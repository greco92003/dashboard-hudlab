import { NextResponse } from "next/server";
import { getTinyOrderProductByExactName } from "@/lib/erp/tiny-existing-product-v2";
import { requireApprovedUser } from "@/lib/security/route-guards";

const ACCESS_PRODUCT_NAME = "LIVRO DIGITAL HUD LAB - Quantidade de Acessos";
const CACHE_DURATION_MS = 10 * 60 * 1_000;
let cache: { product: Awaited<ReturnType<typeof getTinyOrderProductByExactName>>; expiresAt: number } | null = null;

async function loadAccessProduct() {
  if (cache && cache.expiresAt > Date.now()) return cache.product;
  const product = await getTinyOrderProductByExactName(ACCESS_PRODUCT_NAME);
  cache = { product, expiresAt: Date.now() + CACHE_DURATION_MS };
  return product;
}

export async function GET() {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;

  try {
    return NextResponse.json({ product: await loadAccessProduct() });
  } catch (error) {
    console.error("ERP Tiny access product lookup failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível carregar o Livro Digital do Tiny." },
      { status: 502 },
    );
  }
}