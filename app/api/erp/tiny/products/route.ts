import { NextResponse } from "next/server";
import { z } from "zod";
import { extractGhlProductModels } from "@/lib/erp/ghl-product-models";
import {
  buildTinyProductFromCloner,
  buildTinyVariationsFromCloner,
  tinyVariationSize,
  type TinyClonerDetail,
} from "@/lib/erp/tiny-product-cloner";
import { buildVariationSku } from "@/lib/erp/product-rules";
import { fetchCustomFieldDefs, fetchOpportunityById } from "@/lib/ghl/api";
import { requireAdmin } from "@/lib/security/route-guards";
import { tinyV3Request } from "@/lib/tiny/v3-client";
import { artworkThumbnailUrl } from "@/lib/erp/artwork-url";

const requestSchema = z.object({
  dealId: z.string().min(1),
  products: z.array(z.discriminatedUnion("mode", [
    z.object({
      mode: z.literal("clone"),
      modelNumber: z.number().int().positive(),
      clonerId: z.number().int().positive(),
      title: z.string().trim().min(1).max(120),
      baseSku: z.string().trim().min(1).max(50).regex(/^[A-Za-z0-9_-]+$/),
    }),
    z.object({
      mode: z.literal("existing"),
      modelNumber: z.number().int().positive(),
      existingProductId: z.number().int().positive(),
    }),
  ])).min(1).max(10),
});

type TinyListResponse = {
  itens?: Array<{ id: number; sku?: string | null }>;
};

type ProductResult = {
  modelNumber: number;
  sku: string;
  title: string;
  status: "created" | "existing" | "failed";
  tinyProductId?: number;
  variationSkus?: Record<string, string>;
  addedSizes?: string[];
  error?: string;
};

function variationSkuMap(product: TinyClonerDetail) {
  return Object.fromEntries(
    (product.variacoes ?? []).flatMap((variation) => {
      const size = tinyVariationSize(variation);
      const sku = variation.sku?.trim();
      return size && sku ? [[size, sku]] : [];
    }),
  );
}

async function addMissingVariationsFromProduct(
  product: TinyClonerDetail,
  requiredSizes: string[],
) {
  const variationSkus = variationSkuMap(product);
  const missingSizes = requiredSizes.filter((size) => !variationSkus[size]);
  if (missingSizes.length === 0) return { variationSkus, addedSizes: [] as string[] };

  const template = product.variacoes?.find((variation) => tinyVariationSize(variation));
  const baseSku = product.sku?.trim();
  if (!template || !baseSku) {
    throw new Error("O produto existente não possui uma variação-modelo ou SKU base para completar a grade.");
  }
  const sizeGradeIndex = (template.grade ?? []).findIndex((grade) =>
    /tamanho|numera|grade/i.test(grade.chave?.trim() ?? "")
      || /^\d{2}\s*\/\s*\d{2}$/.test(grade.valor?.trim() ?? ""),
  );
  if (sizeGradeIndex < 0) {
    throw new Error("Não foi possível identificar o campo de numeração da grade do produto existente.");
  }

  for (const size of missingSizes) {
    const sku = buildVariationSku(baseSku, size);
    await tinyV3Request(`/produtos/${product.id}/variacoes`, {
      method: "POST",
      body: {
        sku,
        precos: template.precos ?? {
          preco: product.precos?.preco,
          precoPromocional: product.precos?.precoPromocional,
        },
        estoque: { inicial: 0 },
        grade: (template.grade ?? []).map((grade, index) => ({
          chave: grade.chave,
          valor: index === sizeGradeIndex ? size : grade.valor,
        })),
      },
    });
    variationSkus[size] = sku;
  }

  return { variationSkus, addedSizes: missingSizes };
}

async function addMissingVariationsFromCloner(
  product: TinyClonerDetail,
  cloner: TinyClonerDetail,
  baseSku: string,
) {
  const variationSkus = variationSkuMap(product);
  const desired = buildTinyVariationsFromCloner({ cloner, baseSku });
  const addedSizes: string[] = [];

  for (const variation of desired) {
    const size = tinyVariationSize(variation);
    if (!size || variationSkus[size]) continue;
    await tinyV3Request(`/produtos/${product.id}/variacoes`, {
      method: "POST",
      body: variation,
    });
    variationSkus[size] = variation.sku;
    addedSizes.push(size);
  }

  return { variationSkus, addedSizes };
}

async function findProductBySku(sku: string) {
  const response = await tinyV3Request<TinyListResponse>("/produtos", {
    params: { codigo: sku, limit: "10" },
  });
  return response.itens?.find(
    (item) => item.sku?.trim().toUpperCase() === sku.trim().toUpperCase(),
  );
}

async function ensureProductArtwork(productId: number, sourceUrl: string | null) {
  if (!sourceUrl) return;
  const imageUrl = artworkThumbnailUrl(sourceUrl);
  if (!imageUrl) throw new Error("A arte aprovada não possui uma URL de imagem compatível.");
  const attachments = await tinyV3Request<Array<{ id?: number; url?: string | null }>>(
    `/produtos/${productId}/anexos`,
  );
  // Tiny imports an external URL into its own S3, so the saved URL no longer
  // equals the source URL. Any existing attachment means this step was already
  // completed and prevents duplicate images on a repeated validation.
  if (attachments.length > 0) return;
  const created = await tinyV3Request<Array<{ id?: number; url?: string | null }>>(`/produtos/${productId}/anexos`, {
    method: "POST",
    body: [{ url: imageUrl, externo: true }],
  });
  if (!created.some((attachment) => attachment.id || attachment.url)) {
    throw new Error("O Tiny não confirmou a inclusão da imagem do produto.");
  }
}

export async function POST(request: Request) {
  const access = await requireAdmin();
  if (!access.ok) return access.response;

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos para o cadastro dos produtos." },
      { status: 400 },
    );
  }

  try {
    const [opportunity, definitions] = await Promise.all([
      fetchOpportunityById(parsed.data.dealId),
      fetchCustomFieldDefs("opportunity"),
    ]);
    const models = extractGhlProductModels(opportunity, definitions);
    const modelByNumber = new Map(models.map((model) => [model.modelNumber, model]));
    const results: ProductResult[] = [];

    // Sequential writes make the result of each model explicit and avoid Tiny's
    // rate-limit. A failed model does not hide products already created.
    for (const requested of parsed.data.products) {
      const model = modelByNumber.get(requested.modelNumber);
      if (!model) {
        results.push({
          modelNumber: requested.modelNumber,
          sku: requested.mode === "clone" ? requested.baseSku : "",
          title: requested.mode === "clone" ? requested.title : "Produto existente",
          status: "failed",
          error: "Modelo sem grade preenchida na ficha atual do GHL.",
        });
        continue;
      }

      try {
        if (requested.mode === "existing") {
          const product = await tinyV3Request<TinyClonerDetail>(`/produtos/${requested.existingProductId}`);
          if (product.tipo !== "V" || product.produtoPai?.id || /cloner/i.test(product.descricao ?? "")) {
            throw new Error("O item selecionado não é um produto pai com variações válido.");
          }
          // Compatibility for products created by the old flow, which limited
          // the catalog grade to the quantities filled in the GHL order.
          const completed = await addMissingVariationsFromProduct(
            product,
            model.grades.map((grade) => grade.size),
          );
          results.push({
            modelNumber: requested.modelNumber,
            sku: product.sku?.trim() ?? "",
            title: product.descricao?.trim() ?? "Produto existente",
            status: "existing",
            tinyProductId: product.id,
            variationSkus: completed.variationSkus,
            addedSizes: completed.addedSizes,
          });
          continue;
        }

        const cloner = await tinyV3Request<TinyClonerDetail>(
          `/produtos/${requested.clonerId}`,
        );
        if (cloner.tipo !== "V" || cloner.produtoPai?.id || !/cloner/i.test(cloner.descricao ?? "")) {
          throw new Error("O produto selecionado não é um cloner pai válido.");
        }

        const existing = await findProductBySku(requested.baseSku);
        if (existing) {
          const existingProduct = await tinyV3Request<TinyClonerDetail>(`/produtos/${existing.id}`);
          const completed = await addMissingVariationsFromCloner(
            existingProduct,
            cloner,
            requested.baseSku,
          );
          await ensureProductArtwork(existing.id, model.artUrl);
          results.push({
            modelNumber: requested.modelNumber,
            sku: requested.baseSku,
            title: requested.title,
            status: "existing",
            tinyProductId: existing.id,
            variationSkus: completed.variationSkus,
            addedSizes: completed.addedSizes,
          });
          continue;
        }

        const payload = buildTinyProductFromCloner({
          cloner,
          title: requested.title,
          baseSku: requested.baseSku,
        });
        const created = await tinyV3Request<{ id: number }>("/produtos", {
          method: "POST",
          body: payload,
        });
        // The attachment endpoint can be called only after the new parent is
        // available throughout Tiny's product service.
        await new Promise((resolve) => setTimeout(resolve, 750));
        await ensureProductArtwork(created.id, model.artUrl);
        results.push({
          modelNumber: requested.modelNumber,
          sku: requested.baseSku,
          title: requested.title,
          status: "created",
          tinyProductId: created.id,
          variationSkus: variationSkuMap({ id: created.id, variacoes: payload.variacoes }),
        });
      } catch (error) {
        results.push({
          modelNumber: requested.modelNumber,
          sku: requested.mode === "clone" ? requested.baseSku : "",
          title: requested.mode === "clone" ? requested.title : "Produto existente",
          status: "failed",
          error: error instanceof Error ? error.message : "Falha inesperada no Tiny.",
        });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("ERP Tiny product creation failed", error);
    return NextResponse.json(
      { error: "Não foi possível validar a ficha do pedido antes do cadastro." },
      { status: 502 },
    );
  }
}
