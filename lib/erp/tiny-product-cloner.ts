import { buildVariationSku, type ErpGradeItem } from "./product-rules";

type TinyGrade = { chave?: string | null; valor?: string | null };

export type TinyClonerDetail = {
  id: number;
  sku?: string | null;
  descricao?: string | null;
  tipo?: string | null;
  produtoPai?: { id?: number } | null;
  descricaoComplementar?: string | null;
  unidade?: string | null;
  unidadePorCaixa?: string | null;
  ncm?: string | null;
  origem?: number | null;
  codigoEspecificadorSubstituicaoTributaria?: string | null;
  garantia?: string | null;
  observacoes?: string | null;
  marca?: { id?: number } | null;
  categoria?: { id?: number } | null;
  precos?: {
    preco?: number | null;
    precoPromocional?: number | null;
    precoCusto?: number | null;
  } | null;
  dimensoes?: {
    embalagem?: { id?: number } | null;
    largura?: number | null;
    altura?: number | null;
    comprimento?: number | null;
    diametro?: number | null;
    pesoLiquido?: number | null;
    pesoBruto?: number | null;
  } | null;
  tributacao?: {
    gtinEmbalagem?: string | null;
    valorIPIFixo?: number | null;
    classeIPI?: string | null;
  } | null;
  seo?: {
    descricao?: string | null;
    keywords?: string[];
    linkVideo?: string | null;
  } | null;
  fornecedores?: Array<{
    id?: number;
    codigoProdutoNoFornecedor?: string | null;
  }>;
  estoque?: {
    controlar?: boolean | null;
    sobEncomenda?: boolean | null;
    minimo?: number | null;
    maximo?: number | null;
    diasPreparacao?: number | null;
    localizacao?: string | null;
  } | null;
  anexos?: Array<{ url?: string | null; externo?: boolean | null }>;
  producao?: {
    produtos?: Array<{ produto?: { id?: number }; quantidade?: number | null }>;
    etapas?: string[];
  } | null;
  kit?: Array<{ produto?: { id?: number }; quantidade?: number | null }>;
  variacoes?: Array<{
    sku?: string | null;
    gtin?: string | null;
    precos?: { preco?: number | null; precoPromocional?: number | null } | null;
    grade?: TinyGrade[];
  }>;
};

function compact(value: unknown): any {
  if (Array.isArray(value)) {
    const result = value.map(compact).filter((item) => item !== undefined);
    return result.length > 0 ? result : undefined;
  }
  if (value && typeof value === "object") {
    const result = Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [key, compact(item)])
        .filter(([, item]) => item !== undefined && item !== null && item !== ""),
    );
    return Object.keys(result).length > 0 ? result : undefined;
  }
  return value;
}

function variationForSize(cloner: TinyClonerDetail, size: string) {
  return cloner.variacoes?.find((variation) =>
    variation.grade?.some((grade) => grade.valor?.trim() === size),
  );
}

export function buildTinyProductFromCloner(input: {
  cloner: TinyClonerDetail;
  title: string;
  baseSku: string;
  grades: ErpGradeItem[];
}) {
  const { cloner, title, baseSku, grades } = input;
  const gradeKeys = Array.from(
    new Set(
      (cloner.variacoes ?? [])
        .flatMap((variation) => variation.grade ?? [])
        .map((grade) => grade.chave?.trim())
        .filter((key): key is string => Boolean(key)),
    ),
  );

  return compact({
    tipo: cloner.tipo,
    sku: baseSku.trim(),
    descricao: title.trim(),
    descricaoComplementar: cloner.descricaoComplementar,
    unidade: cloner.unidade,
    unidadePorCaixa: cloner.unidadePorCaixa,
    ncm: cloner.ncm,
    origem: cloner.origem,
    codigoEspecificadorSubstituicaoTributaria:
      cloner.codigoEspecificadorSubstituicaoTributaria,
    garantia: cloner.garantia,
    observacoes: cloner.observacoes,
    marca: cloner.marca?.id ? { id: cloner.marca.id } : undefined,
    categoria: cloner.categoria?.id ? { id: cloner.categoria.id } : undefined,
    precos: {
      preco: cloner.precos?.preco,
      precoPromocional: cloner.precos?.precoPromocional,
      precoCusto: cloner.precos?.precoCusto,
    },
    dimensoes: {
      embalagem: cloner.dimensoes?.embalagem?.id
        ? { id: cloner.dimensoes.embalagem.id }
        : undefined,
      largura: cloner.dimensoes?.largura,
      altura: cloner.dimensoes?.altura,
      comprimento: cloner.dimensoes?.comprimento,
      diametro: cloner.dimensoes?.diametro,
      pesoLiquido: cloner.dimensoes?.pesoLiquido,
      pesoBruto: cloner.dimensoes?.pesoBruto,
    },
    tributacao: {
      gtinEmbalagem: cloner.tributacao?.gtinEmbalagem,
      valorIPIFixo: cloner.tributacao?.valorIPIFixo,
      classeIPI: cloner.tributacao?.classeIPI,
    },
    seo: {
      titulo: title.trim(),
      descricao: cloner.seo?.descricao,
      keywords: cloner.seo?.keywords,
      linkVideo: cloner.seo?.linkVideo,
    },
    fornecedores: cloner.fornecedores?.flatMap((supplier, index) =>
      supplier.id
        ? [{
            id: supplier.id,
            codigoProdutoNoFornecedor: supplier.codigoProdutoNoFornecedor,
            padrao: index === 0,
          }]
        : [],
    ),
    estoque: {
      controlar: cloner.estoque?.controlar,
      sobEncomenda: cloner.estoque?.sobEncomenda,
      minimo: cloner.estoque?.minimo,
      maximo: cloner.estoque?.maximo,
      diasPreparacao: cloner.estoque?.diasPreparacao,
      localizacao: cloner.estoque?.localizacao,
      inicial: 0,
    },
    grade: gradeKeys,
    producao: {
      produtos: cloner.producao?.produtos?.flatMap((item) =>
        item.produto?.id && item.quantidade != null
          ? [{ produto: { id: item.produto.id }, quantidade: item.quantidade }]
          : [],
      ),
      etapas: cloner.producao?.etapas,
    },
    kit: cloner.kit?.flatMap((item) =>
      item.produto?.id && item.quantidade != null
        ? [{ produto: { id: item.produto.id }, quantidade: item.quantidade }]
        : [],
    ),
    variacoes: grades.map((grade) => {
      const source = variationForSize(cloner, grade.size);
      const sourceGrade = source?.grade ?? [];
      return compact({
        sku: buildVariationSku(baseSku, grade.size),
        // GTIN is intentionally not cloned: it must remain unique per product.
        precos: source?.precos ?? {
          preco: cloner.precos?.preco,
          precoPromocional: cloner.precos?.precoPromocional,
        },
        estoque: { inicial: 0 },
        grade: sourceGrade.map((item) => ({
          chave: item.chave,
          valor: item.valor,
        })),
      });
    }),
  });
}
