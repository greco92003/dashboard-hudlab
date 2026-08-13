import { NextResponse } from "next/server";
import type { TinyCloner } from "@/lib/erp/types";
import { requireAdmin } from "@/lib/security/route-guards";
import { tinyV3Request } from "@/lib/tiny/v3-client";

type TinyProductListItem = {
  id: number;
  sku?: string | null;
  descricao?: string | null;
};

type TinyProductDetail = TinyProductListItem & {
  tipo?: string | null;
  produtoPai?: { id?: number } | null;
  precos?: { preco?: number | null } | null;
  variacoes?: Array<{
    grade?: Array<{ chave?: string; valor?: string }>;
  }>;
};

const CACHE_DURATION_MS = 10 * 60 * 1_000;
let cache: { cloners: TinyCloner[]; expiresAt: number } | null = null;
let pendingLoad: Promise<TinyCloner[]> | null = null;

async function loadCloners() {
  if (cache && cache.expiresAt > Date.now()) return cache.cloners;
  if (pendingLoad) return pendingLoad;

  pendingLoad = (async () => {
    const lists = await Promise.all(
      ["Chinelo Slide CLONER", "Chinelo Slide Infantil CLONER"].map((nome) =>
        tinyV3Request<{ itens?: TinyProductListItem[] }>("/produtos", {
          params: { nome, limit: "100" },
        }),
      ),
    );

    const candidates = new Map<number, TinyProductListItem>();
    for (const item of lists.flatMap((list) => list.itens ?? [])) {
      const description = item.descricao ?? "";
      if (/cloner/i.test(description) && !/\s-\s\d{2}\/\d{2}\s*$/i.test(description)) {
        candidates.set(item.id, item);
      }
    }

    // Sequential detail reads prevent a request burst against Tiny's limit.
    const details: TinyProductDetail[] = [];
    for (const item of candidates.values()) {
      try {
        details.push(await tinyV3Request<TinyProductDetail>(`/produtos/${item.id}`));
      } catch (error) {
        console.warn(`Could not load Tiny cloner ${item.id}`, error);
      }
    }

    const cloners: TinyCloner[] = details
      .filter(
        (product) =>
          /cloner/i.test(product.descricao ?? "") &&
          product.tipo === "V" &&
          !product.produtoPai?.id,
      )
      .map((product) => ({
        id: product.id,
        sku: product.sku?.trim() || "SEM-SKU",
        description: product.descricao?.trim() || "Cloner sem nome",
        price: product.precos?.preco ?? null,
        variationSizes: (product.variacoes ?? []).flatMap((variation) =>
          (variation.grade ?? [])
            .filter((grade) => /tamanho|numera|grade/i.test(grade.chave ?? ""))
            .map((grade) => grade.valor?.trim())
            .filter((size): size is string => Boolean(size)),
        ),
        variationCount: product.variacoes?.length ?? 0,
      }))
      .sort((a, b) => a.description.localeCompare(b.description, "pt-BR"));

    cache = { cloners, expiresAt: Date.now() + CACHE_DURATION_MS };
    return cloners;
  })();

  try {
    return await pendingLoad;
  } finally {
    pendingLoad = null;
  }
}

export async function GET() {
  const access = await requireAdmin();
  if (!access.ok) return access.response;

  try {
    const cloners = await loadCloners();
    return NextResponse.json({ cloners });
  } catch (error) {
    console.error("ERP Tiny cloner search failed", error);
    const message = error instanceof Error ? error.message : "";
    const status = /OAuth|Token expirado|re-autorizar/i.test(message) ? 503 : 502;
    return NextResponse.json(
      { error: "Não foi possível carregar os produtos-cloner do Tiny." },
      { status },
    );
  }
}
