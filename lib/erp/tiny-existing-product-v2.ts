import { getTinyV2Token } from "@/lib/tiny/auth";
import type { TinyExistingProduct } from "./types";

const BASE_URL = process.env.TINY_BASE_URL ?? "https://api.tiny.com.br/api2";

type SearchProduct = {
  id?: number | string;
  nome?: string;
  codigo?: string;
  tipoVariacao?: "N" | "P" | "V";
};

type ProductVariation = {
  variacao?: {
    id?: number | string;
    codigo?: string;
    grade?: Record<string, string>;
  };
};

type ProductDetail = SearchProduct & {
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
    const variation = item.variacao;
    const gradeEntries = Object.entries(variation?.grade ?? {});
    const size = gradeEntries.find(([key]) => /tamanho|numera|grade/i.test(key))?.[1]
      ?? gradeEntries[0]?.[1];
    if (size?.trim() && variation?.codigo?.trim()) {
      variationSkus[size.trim()] = variation.codigo.trim();
    }
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
