import { NextResponse } from "next/server";
import { z } from "zod";
import { extractGhlProductModels } from "@/lib/erp/ghl-product-models";
import {
  buildTinyProductFromCloner,
  buildTinyVariationsFromCloner,
  tinyVariationSize,
  type TinyClonerDetail,
} from "@/lib/erp/tiny-product-cloner";
import {
  mergeTinyCreatedProductResponse,
  type TinyCreatedProductResponse,
} from "@/lib/erp/tiny-created-product";
import { buildVariationSku } from "@/lib/erp/product-rules";
import { extractGhlOrderSource } from "@/lib/erp/order-rules";
import { fetchCustomFieldDefs, fetchOpportunityById } from "@/lib/ghl/api";
import { requireApprovedUser } from "@/lib/security/route-guards";
import { tinyV3Request } from "@/lib/tiny/v3-client";
import { artworkImportUrl } from "@/lib/erp/artwork-proxy";
import { setTinyVariationsAsManufactured } from "@/lib/erp/tiny-manufacturing-v2";
import {
  prepareTinyManufacturedVariations,
  type TinyManufacturingPair,
} from "@/lib/erp/tiny-manufacturing-payload";

export const maxDuration = 300;

const requestSchema = z.object({
  dealId: z.string().min(1),
  products: z.array(z.discriminatedUnion("mode", [
    z.object({
      mode: z.literal("clone"),
      modelNumber: z.number().int().positive(),
      audience: z.enum(["adulto", "infantil"]),
      clonerId: z.number().int().positive(),
      title: z.string().trim().min(1).max(120),
      baseSku: z.string().trim().min(1).max(50).regex(/^[A-Za-z0-9_-]+$/),
    }),
    z.object({
      mode: z.literal("existing"),
      modelNumber: z.number().int().positive(),
      audience: z.enum(["adulto", "infantil"]),
      existingProductId: z.number().int().positive(),
    }),
  ])).min(1).max(10),
});

type TinyListResponse = {
  itens?: Array<{ id: number; sku?: string | null; descricao?: string | null }>;
};

type ProductResult = {
  modelNumber: number;
  audience: "adulto" | "infantil";
  sku: string;
  title: string;
  status: "created" | "existing" | "failed";
  tinyProductId?: number;
  variationSkus?: Record<string, string>;
  addedSizes?: string[];
  manufacturedSizes?: string[];
  error?: string;
};

type PendingManufacturing = {
  resultIndex: number;
  pairs: TinyManufacturingPair[];
  sizes: string[];
};

const CLONER_CACHE_DURATION_MS = 10 * 60 * 1_000;
const clonerCache = new Map<number, { cloner: TinyClonerDetail; expiresAt: number }>();
const pendingCloners = new Map<number, Promise<TinyClonerDetail>>();

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
        precos: {
          preco: template.precos?.preco ?? product.precos?.preco ?? 0,
          precoPromocional: template.precos?.precoPromocional ?? product.precos?.precoPromocional,
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


async function resolveClonerVariations(
  product: TinyClonerDetail,
  cloner: TinyClonerDetail,
  baseSku: string,
  unitPrice: number,
) {
  const desired = buildTinyVariationsFromCloner({ cloner, baseSku, unitPrice });
  const resolved = [...(product.variacoes ?? [])];
  const variationSkus: Record<string, string> = {};
  const missingVariations: string[] = [];

  for (const variation of desired) {
    const size = tinyVariationSize(variation);
    const sku = variation.sku?.trim();
    if (!size || !sku) continue;

    let target = resolved.find(
      (item) => item.sku?.trim().toUpperCase() === sku.toUpperCase(),
    ) ?? resolved.find((item) => tinyVariationSize(item) === size);

    if (!target?.id) {
      const catalogItem = await findProductBySku(sku);
      if (catalogItem) {
        target = {
          ...variation,
          id: catalogItem.id,
          descricao: catalogItem.descricao,
        };
      }
    }


    if (!target?.id) {
      missingVariations.push(`${size} (${sku})`);
      continue;
    }

    target = {
      ...target,
      precos: variation.precos ?? target.precos,
    };
    const existingIndex = resolved.findIndex(
      (item) => item.id === target?.id
        || item.sku?.trim().toUpperCase() === sku.toUpperCase()
        || tinyVariationSize(item) === size,
    );
    if (existingIndex >= 0) resolved[existingIndex] = target;
    else resolved.push(target);
    variationSkus[size] = target.sku?.trim() || sku;
  }

  if (missingVariations.length > 0) {
    throw new Error(
      `O produto pai ${baseSku} está incompleto no Tiny. Faltam as variações ${missingVariations.join(", ")}. Ele precisa ser recriado em um único cadastro.`,
    );
  }

  return {
    variationSkus,
    product: { ...product, variacoes: resolved },
  };
}

function hasProduction(production: TinyClonerDetail["producao"]) {
  return Boolean(production?.produtos?.length || production?.etapas?.length);
}
async function hydrateClonerManufacturing(cloner: TinyClonerDetail) {
  const variations: NonNullable<TinyClonerDetail["variacoes"]> = [];
  for (const variation of cloner.variacoes ?? []) {
    if (!variation.id) {
      throw new Error("Uma variação do cloner não retornou seu identificador no Tiny.");
    }
    const detail = await tinyV3Request<TinyClonerDetail>(`/produtos/${variation.id}`);
    let production = detail.producao;
    if (detail.tipo === "F" && !hasProduction(production)) {
      production = await tinyV3Request<NonNullable<TinyClonerDetail["producao"]>>(
        `/produtos/${variation.id}/fabricado`,
      );
    }
    variations.push({
      ...variation,
      descricao: detail.descricao,
      tipo: detail.tipo,
      precos: {
        preco: detail.precos?.preco ?? variation.precos?.preco,
        precoPromocional: detail.precos?.precoPromocional ?? variation.precos?.precoPromocional,
      },
      dimensoes: detail.dimensoes ?? variation.dimensoes,
      producao: production,
    });
  }
  return { ...cloner, variacoes: variations };
}

async function getHydratedCloner(clonerId: number) {
  const cached = clonerCache.get(clonerId);
  if (cached && cached.expiresAt > Date.now()) return cached.cloner;

  const inFlight = pendingCloners.get(clonerId);
  if (inFlight) return inFlight;

  const pending = (async () => {
    const parent = await tinyV3Request<TinyClonerDetail>(`/produtos/${clonerId}`);
    if (parent.tipo !== "V" || parent.produtoPai?.id || !/cloner/i.test(parent.descricao ?? "")) {
      throw new Error("O produto selecionado não é um cloner pai válido.");
    }

    const cloner = await hydrateClonerManufacturing(parent);
    clonerCache.set(clonerId, {
      cloner,
      expiresAt: Date.now() + CLONER_CACHE_DURATION_MS,
    });
    return cloner;
  })();

  pendingCloners.set(clonerId, pending);
  try {
    return await pending;
  } finally {
    pendingCloners.delete(clonerId);
  }
}

async function findProductBySku(sku: string) {
  const response = await tinyV3Request<TinyListResponse>("/produtos", {
    params: { codigo: sku, situacao: "A", limit: "10" },
  });
  return response.itens?.find(
    (item) => item.sku?.trim().toUpperCase() === sku.trim().toUpperCase(),
  );
}

type TinyAttachment = { id?: number; url?: string | null; externo?: boolean | null };

function hasImportedImage(attachments: TinyAttachment[]) {
  return attachments.some(
    (attachment) => attachment.externo === false && Boolean(attachment.id || attachment.url),
  );
}

async function ensureProductArtwork(
  product: TinyClonerDetail,
  sourceUrl: string | null,
  publicOrigin: string,
) {
  const artwork = productArtwork(sourceUrl, publicOrigin);
  if (!artwork || hasImportedImage(product.anexos ?? [])) return;

  const created = await tinyV3Request<TinyAttachment[]>(`/produtos/${product.id}/anexos`, {
    method: "POST",
    body: [artwork],
  });

  if (!hasImportedImage(created)) {
    throw new Error("O Tiny não confirmou a importação da imagem do produto.");
  }
}

function productArtwork(sourceUrl: string | null, publicOrigin: string) {
  if (!sourceUrl) return undefined;
  const imageUrl = artworkImportUrl(sourceUrl, publicOrigin);
  if (!imageUrl) throw new Error("A arte aprovada não possui uma URL de imagem compatível.");

  return { url: imageUrl, externo: false as const };
}

export async function POST(request: Request) {
  const access = await requireApprovedUser();
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
    const rawUnitPrice = extractGhlOrderSource(opportunity, definitions).unitPrice;
    if (rawUnitPrice == null || rawUnitPrice <= 0) {
      return NextResponse.json(
        { error: "O Valor Unitário do Par precisa estar preenchido no GHL antes do cadastro." },
        { status: 409 },
      );
    }
    const unitPrice = Math.round((rawUnitPrice + Number.EPSILON) * 100) / 100;
    const modelByKey = new Map(
      models.map((model) => [`${model.modelNumber}:${model.audience}`, model]),
    );
    const publicOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim()
      || new URL(request.url).origin;
    const results: ProductResult[] = [];
    const pendingManufacturing: PendingManufacturing[] = [];

    for (const requested of parsed.data.products) {
      const model = modelByKey.get(`${requested.modelNumber}:${requested.audience}`);
      if (!model) {
        results.push({
          modelNumber: requested.modelNumber,
          audience: requested.audience,
          sku: requested.mode === "clone" ? requested.baseSku : "",
          title: requested.mode === "clone" ? requested.title : "Produto existente",
          status: "failed",
          error: "Modelo sem grade preenchida na ficha atual do GHL.",
        });
        continue;
      }

      try {
        if (requested.mode === "existing") {
          const product = await tinyV3Request<TinyClonerDetail>(
            `/produtos/${requested.existingProductId}`,
          );
          if (product.tipo !== "V" || product.produtoPai?.id || /cloner/i.test(product.descricao ?? "")) {
            throw new Error("O item selecionado não é um produto pai com variações válido.");
          }
          const completed = await addMissingVariationsFromProduct(
            product,
            model.grades.map((grade) => grade.size),
          );
          results.push({
            modelNumber: requested.modelNumber,
            audience: requested.audience,
            sku: product.sku?.trim() ?? "",
            title: product.descricao?.trim() ?? "Produto existente",
            status: "existing",
            tinyProductId: product.id,
            variationSkus: completed.variationSkus,
          });
          continue;
        }

        const cloner = await getHydratedCloner(requested.clonerId);
        const clonerIsInfant = /infantil/i.test(cloner.descricao ?? "");
        if ((requested.audience === "infantil") !== clonerIsInfant) {
          throw new Error(`Escolha um cloner ${requested.audience} para esta grade.`);
        }

        const existing = await findProductBySku(requested.baseSku);
        let completed: Awaited<ReturnType<typeof resolveClonerVariations>>;
        let status: "created" | "existing";
        let tinyProductId: number;

        if (existing) {
          const existingProduct = await tinyV3Request<TinyClonerDetail>(
            `/produtos/${existing.id}`,
          );
          completed = await resolveClonerVariations(
            existingProduct,
            cloner,
            requested.baseSku,
            unitPrice,
          );
          await ensureProductArtwork(existingProduct, model.artUrl, publicOrigin);
          status = "existing";
          tinyProductId = existing.id;
        } else {
          const payload = buildTinyProductFromCloner({
            cloner,
            title: requested.title,
            baseSku: requested.baseSku,
            unitPrice,
            artwork: productArtwork(model.artUrl, publicOrigin),
          });
          const created = await tinyV3Request<TinyCreatedProductResponse>("/produtos", {
            method: "POST",
            body: payload,
          });
          const createdProduct = mergeTinyCreatedProductResponse(payload, created);
          completed = await resolveClonerVariations(
            createdProduct,
            cloner,
            requested.baseSku,
            unitPrice,
          );
          status = "created";
          tinyProductId = created.id;
        }

        const manufacturing = prepareTinyManufacturedVariations(
          completed.product,
          cloner,
          unitPrice,
        );
        const resultIndex = results.length;
        results.push({
          modelNumber: requested.modelNumber,
          audience: requested.audience,
          sku: requested.baseSku,
          title: requested.title,
          status,
          tinyProductId,
          variationSkus: completed.variationSkus,
          manufacturedSizes: manufacturing.pairs.length === 0 ? [] : undefined,
        });
        if (manufacturing.pairs.length > 0) {
          pendingManufacturing.push({
            resultIndex,
            pairs: manufacturing.pairs,
            sizes: manufacturing.sizes,
          });
        }
      } catch (error) {
        results.push({
          modelNumber: requested.modelNumber,
          audience: requested.audience,
          sku: requested.mode === "clone" ? requested.baseSku : "",
          title: requested.mode === "clone" ? requested.title : "Produto existente",
          status: "failed",
          error: error instanceof Error ? error.message : "Falha inesperada no Tiny.",
        });
      }
    }

    if (pendingManufacturing.length > 0) {
      try {
        await setTinyVariationsAsManufactured(
          pendingManufacturing.flatMap((pending) => pending.pairs),
        );
        for (const pending of pendingManufacturing) {
          results[pending.resultIndex].manufacturedSizes = pending.sizes;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha inesperada no Tiny.";
        for (const pending of pendingManufacturing) {
          results[pending.resultIndex].status = "failed";
          results[pending.resultIndex].error =
            `Produto salvo no Tiny, mas não foi possível definir suas variações como Fabricadas: ${message}`;
        }
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
