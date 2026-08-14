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
import { requireApprovedUser } from "@/lib/security/route-guards";
import { getTinyV2Token } from "@/lib/tiny/auth";
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
  manufacturedSizes?: string[];
  error?: string;
};

type TinyV2AlterResponse = {
  retorno?: {
    status?: string;
    erros?: Array<{ erro?: string }>;
    registros?: Array<{
      registro?: {
        status?: string;
        erros?: Array<{ erro?: string }>;
      };
    }> | {
      registro?: {
        status?: string;
        erros?: Array<{ erro?: string }>;
      };
    };
  };
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
      producao: production,
    });
  }
  return { ...cloner, variacoes: variations };
}

async function setVariationAsManufactured(
  target: TinyClonerDetail,
  source: NonNullable<TinyClonerDetail["variacoes"]>[number],
) {
  if (!target.id || !target.descricao?.trim()) {
    throw new Error("O Tiny não retornou os dados necessários da variação criada.");
  }
  if (!hasProduction(source.producao)) {
    throw new Error(
      `A variação ${source.sku ?? source.id ?? "do cloner"} está marcada como fabricada, mas não possui estrutura ou etapa de produção.`,
    );
  }

  const product = {
    sequencia: 1,
    id: target.id,
    nome: target.descricao.trim(),
    unidade: target.unidade?.trim() || "PR",
    preco: target.precos?.preco ?? 0,
    ncm: target.ncm?.trim() ?? "",
    origem: String(target.origem ?? 0),
    situacao: "A",
    tipo: "P",
    classe_produto: "F",
    estrutura: (source.producao?.produtos ?? []).flatMap((item) =>
      item.produto?.id && item.quantidade != null
        ? [{ item: {
            id_produto: item.produto.id,
            descricao: item.produto.descricao?.trim() || item.produto.sku?.trim() || "Componente",
            quantidade: item.quantidade,
          } }]
        : [],
    ),
    etapas: (source.producao?.etapas ?? []).map((name) => ({ etapa: { nome: name } })),
  };
  const response = await fetch(
    `${process.env.TINY_BASE_URL ?? "https://api.tiny.com.br/api2"}/produto.alterar.php`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({
        token: getTinyV2Token(),
        formato: "JSON",
        produto: JSON.stringify({ produtos: [{ produto: product }] }),
      }),
      cache: "no-store",
    },
  );
  const responseText = await response.text();
  let data: TinyV2AlterResponse;
  try {
    data = JSON.parse(responseText) as TinyV2AlterResponse;
  } catch {
    throw new Error(
      `O Tiny devolveu uma resposta inválida ao converter ${target.sku ?? target.id} para Fabricado.`,
    );
  }
  const records = data.retorno?.registros;
  const record = (Array.isArray(records) ? records[0] : records)?.registro;
  if (!response.ok || data.retorno?.status !== "OK" || record?.status !== "OK") {
    const errors = [
      ...(data.retorno?.erros ?? []),
      ...(record?.erros ?? []),
    ].map((item) => item.erro).filter(Boolean).join("; ");
    throw new Error(errors || `O Tiny não converteu a variação ${target.sku ?? target.id} para Fabricado.`);
  }
}

async function ensureManufacturedVariations(
  product: TinyClonerDetail,
  cloner: TinyClonerDetail,
) {
  const targetBySize = new Map(
    (product.variacoes ?? []).flatMap((variation) => {
      const size = tinyVariationSize(variation);
      return size ? [[size, variation] as const] : [];
    }),
  );
  const manufacturedSizes: string[] = [];

  for (const source of cloner.variacoes ?? []) {
    if (source.tipo !== "F") continue;
    const size = tinyVariationSize(source);
    const targetVariation = size ? targetBySize.get(size) : undefined;
    if (!size || !targetVariation?.id) {
      throw new Error(`Não foi possível relacionar a variação fabricada ${size ?? source.sku ?? "do cloner"}.`);
    }
    const target = await tinyV3Request<TinyClonerDetail>(`/produtos/${targetVariation.id}`);
    if (target.tipo === "F") continue;
    await setVariationAsManufactured(target, source);
    manufacturedSizes.push(size);
  }

  return manufacturedSizes;
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

        const clonerParent = await tinyV3Request<TinyClonerDetail>(
          `/produtos/${requested.clonerId}`,
        );
        if (clonerParent.tipo !== "V" || clonerParent.produtoPai?.id || !/cloner/i.test(clonerParent.descricao ?? "")) {
          throw new Error("O produto selecionado não é um cloner pai válido.");
        }
        const cloner = await hydrateClonerManufacturing(clonerParent);

        const existing = await findProductBySku(requested.baseSku);
        if (existing) {
          const existingProduct = await tinyV3Request<TinyClonerDetail>(`/produtos/${existing.id}`);
          const completed = await addMissingVariationsFromCloner(
            existingProduct,
            cloner,
            requested.baseSku,
          );
          if (completed.addedSizes.length > 0) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
          const preparedProduct = completed.addedSizes.length > 0
            ? await tinyV3Request<TinyClonerDetail>(`/produtos/${existing.id}`)
            : existingProduct;
          const manufacturedSizes = await ensureManufacturedVariations(preparedProduct, cloner);
          await ensureProductArtwork(existing.id, model.artUrl);
          results.push({
            modelNumber: requested.modelNumber,
            sku: requested.baseSku,
            title: requested.title,
            status: "existing",
            tinyProductId: existing.id,
            variationSkus: completed.variationSkus,
            addedSizes: completed.addedSizes,
            manufacturedSizes,
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
        const createdProduct = await tinyV3Request<TinyClonerDetail>(`/produtos/${created.id}`);
        const manufacturedSizes = await ensureManufacturedVariations(createdProduct, cloner);
        await ensureProductArtwork(created.id, model.artUrl);
        results.push({
          modelNumber: requested.modelNumber,
          sku: requested.baseSku,
          title: requested.title,
          status: "created",
          tinyProductId: created.id,
          variationSkus: variationSkuMap({ id: created.id, variacoes: payload.variacoes }),
          manufacturedSizes,
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
