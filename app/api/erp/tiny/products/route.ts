import { NextResponse } from "next/server";
import { z } from "zod";
import { extractGhlProductModels } from "@/lib/erp/ghl-product-models";
import {
  buildTinyProductFromCloner,
  type TinyClonerDetail,
} from "@/lib/erp/tiny-product-cloner";
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
  error?: string;
};

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
          const availableSizes = new Set((product.variacoes ?? []).flatMap((variation) =>
            (variation.grade ?? []).map((grade) => grade.valor?.trim()).filter((size): size is string => Boolean(size)),
          ));
          const missingSizes = model.grades.map((grade) => grade.size).filter((size) => !availableSizes.has(size));
          if (missingSizes.length) throw new Error(`O produto existente não possui ${missingSizes.join(", ")}.`);
          results.push({
            modelNumber: requested.modelNumber,
            sku: product.sku?.trim() ?? "",
            title: product.descricao?.trim() ?? "Produto existente",
            status: "existing",
            tinyProductId: product.id,
          });
          continue;
        }

        const existing = await findProductBySku(requested.baseSku);
        if (existing) {
          await ensureProductArtwork(existing.id, model.artUrl);
          results.push({
            modelNumber: requested.modelNumber,
            sku: requested.baseSku,
            title: requested.title,
            status: "existing",
            tinyProductId: existing.id,
          });
          continue;
        }

        const cloner = await tinyV3Request<TinyClonerDetail>(
          `/produtos/${requested.clonerId}`,
        );
        if (cloner.tipo !== "V" || cloner.produtoPai?.id || !/cloner/i.test(cloner.descricao ?? "")) {
          throw new Error("O produto selecionado não é um cloner pai válido.");
        }

        const clonerSizes = new Set(
          (cloner.variacoes ?? []).flatMap((variation) =>
            (variation.grade ?? [])
              .map((grade) => grade.valor?.trim())
              .filter((size): size is string => Boolean(size)),
          ),
        );
        const missingSizes = model.grades
          .map((grade) => grade.size)
          .filter((size) => !clonerSizes.has(size));
        if (missingSizes.length) {
          throw new Error(`O cloner não possui as numerações ${missingSizes.join(", ")}.`);
        }

        const payload = buildTinyProductFromCloner({
          cloner,
          title: requested.title,
          baseSku: requested.baseSku,
          grades: model.grades,
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
