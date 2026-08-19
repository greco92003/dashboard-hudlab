import { getTinyV2Token } from "@/lib/tiny/auth";
import { tinyV3Request } from "@/lib/tiny/v3-client";
import { buildVariationSku } from "./product-rules";
import type { TinyExistingProduct, TinyOrderProduct } from "./types";

const BASE_URL = process.env.TINY_BASE_URL ?? "https://api.tiny.com.br/api2";

type SearchProduct = {
  id?: number | string;
  nome?: string;
  codigo?: string;
  tipoVariacao?: "N" | "P" | "V";
};

type VariationGrade = Record<string, string> | Array<{
  chave?: string | null;
  valor?: string | null;
}>;

type TinyV2Variation = {
  id?: number | string;
  codigo?: string;
  grade?: VariationGrade;
};

type ProductVariation = TinyV2Variation | { variacao?: TinyV2Variation };

type ProductDetail = SearchProduct & {
  unidade?: string;
  preco?: number | string;
  ncm?: string;
  origem?: number | string;
  variacoes?: ProductVariation[];
};

type TinyV2Response = {
  retorno?: {
    status?: string;
    codigo_erro?: number | string;
    erros?: Array<{ erro?: string }>;
    produtos?: Array<{ produto?: SearchProduct }>;
    produto?: ProductDetail;
  };
};

async function tinyV2Post(path: string, params: Record<string, string>) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({
      token: getTinyV2Token(),
      formato: "JSON",
      ...params,
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Tiny API v2 respondeu HTTP ${response.status}.`);
  const data = await response.json() as TinyV2Response;
  if (!data.retorno) throw new Error("O Tiny retornou uma resposta inválida.");
  return data.retorno;
}

function tinyError(retorno: NonNullable<TinyV2Response["retorno"]>, fallback: string) {
  return retorno.erros?.map((item) => item.erro).filter(Boolean).join("; ") || fallback;
}

export function tinyV2VariationSize(grade: VariationGrade | null | undefined) {
  if (Array.isArray(grade)) {
    const preferred = grade.find((item) =>
      /tamanho|numera|grade/i.test(item.chave?.trim() ?? ""));
    const numeric = grade.find((item) =>
      /^\d{2}\s*\/\s*\d{2}$/.test(item.valor?.trim() ?? ""));
    return (preferred?.valor ?? numeric?.valor ?? grade[0]?.valor)?.trim() || null;
  }
  const entries = Object.entries(grade ?? {});
  return (entries.find(([key]) => /tamanho|numera|grade/i.test(key))?.[1]
    ?? entries.find(([, value]) => /^\d{2}\s*\/\s*\d{2}$/.test(value?.trim() ?? ""))?.[1]
    ?? entries[0]?.[1])?.trim() || null;
}

export async function getTinyOrderProductByExactName(name: string): Promise<TinyOrderProduct> {
  const search = await tinyV2Post("/produtos.pesquisa.php", {
    pesquisa: name,
    situacao: "A",
  });
  if (search.status !== "OK") {
    throw new Error(tinyError(search, "Falha ao pesquisar o produto no Tiny."));
  }
  const matches = (search.produtos ?? [])
    .map((item) => item.produto)
    .filter((product): product is SearchProduct =>
      Boolean(product?.id) && product?.nome?.trim() === name,
    );
  if (matches.length === 0) throw new Error('Produto "' + name + '" não encontrado no Tiny.');
  if (matches.length > 1) throw new Error('Há mais de um produto com o nome "' + name + '" no Tiny.');

  const detailResponse = await tinyV2Post("/produto.obter.php", { id: String(matches[0].id) });
  if (detailResponse.status !== "OK" || !detailResponse.produto) {
    throw new Error(tinyError(detailResponse, "Falha ao obter o produto no Tiny."));
  }
  const product = detailResponse.produto;
  const sku = product.codigo?.trim() ?? "";
  const unit = product.unidade?.trim() ?? "";
  if (!sku) throw new Error('O produto "' + name + '" está sem SKU no Tiny.');
  if (!unit) throw new Error('O produto "' + name + '" está sem unidade no Tiny.');
  const parsedPrice = Number(String(product.preco ?? "").replace(",", "."));

  return {
    id: Number(product.id),
    sku,
    description: product.nome?.trim() || name,
    price: Number.isFinite(parsedPrice) ? parsedPrice : null,
    unit,
    ncm: product.ncm?.trim() || null,
    origin: product.origem === undefined ? null : Number(product.origem),
  };
}

export async function searchTinyExistingProducts(query: string): Promise<TinyExistingProduct[]> {
  const retorno = await tinyV2Post("/produtos.pesquisa.php", {
    pesquisa: query,
    situacao: "A",
  });
  if (String(retorno.codigo_erro ?? "") === "20") return [];
  if (retorno.status !== "OK") throw new Error(tinyError(retorno, "Falha ao pesquisar produtos no Tiny."));

  return (retorno.produtos ?? [])
    .map((item) => item.produto)
    .filter((product): product is SearchProduct =>
      Boolean(product?.id) && product?.tipoVariacao === "P" && !/cloner/i.test(product.nome ?? ""),
    )
    .slice(0, 20)
    .map((product) => ({
      id: Number(product.id),
      sku: product.codigo?.trim() ?? "",
      description: product.nome?.trim() || "Produto sem nome",
      variationSkus: {},
      variationSizes: [],
    }));
}

export async function getTinyExistingProduct(id: number): Promise<TinyExistingProduct> {
  const retorno = await tinyV2Post("/produto.obter.php", { id: String(id) });
  if (retorno.status !== "OK" || !retorno.produto) {
    throw new Error(tinyError(retorno, "Falha ao obter o produto no Tiny."));
  }
  const product = retorno.produto;
  if (product.tipoVariacao !== "P" || /cloner/i.test(product.nome ?? "")) {
    throw new Error("Selecione um produto pai cadastrado, com grade de variações.");
  }

  const variationSkus: Record<string, string> = {};
  for (const item of product.variacoes ?? []) {
    const variation = ("variacao" in item ? item.variacao : undefined)
      ?? (item as TinyV2Variation);
    const size = tinyV2VariationSize(variation?.grade);
    let sku = variation?.codigo?.trim() ?? "";
    if (!sku && variation?.id) {
      try {
        const v3 = await tinyV3Request<{ sku?: string | null }>(`/produtos/${variation.id}`);
        sku = v3.sku?.trim() ?? "";
      } catch {
        // Products created by the ERP flow have deterministic variation SKUs.
        // This fallback keeps the order form usable during a transient v3 read failure.
      }
    }
    if (!sku && size && product.codigo?.trim()) {
      sku = buildVariationSku(product.codigo.trim(), size);
    }
    if (size && sku) variationSkus[size] = sku;
  }
  if (Object.keys(variationSkus).length === 0) {
    throw new Error("O produto selecionado não possui variações com grade identificável.");
  }

  return {
    id: Number(product.id),
    sku: product.codigo?.trim() ?? "",
    description: product.nome?.trim() || "Produto sem nome",
    variationSkus,
    variationSizes: Object.keys(variationSkus),
  };
}