/**
 * Leitura ao vivo do GHL e do Tiny para o estoque de solados.
 *
 * Nada disso vive em tabela: a grade e a cor do solado mudam no CRM várias
 * vezes por dia enquanto o time completa os pedidos, e compras precisa decidir
 * sobre o estado de agora. O custo é ~100 chamadas por atualização, então o
 * resultado fica em cache por alguns minutos e a tela mostra a hora da leitura.
 */

import {
  fetchCustomFieldDefs,
  fetchGhlPipelines,
  fetchOpportunityById,
  searchGhlOpportunitiesByStage,
  type GhlCustomFieldDef,
  type GhlOpportunity,
} from "@/lib/ghl/api";
import { normalizeStageTitle } from "@/lib/ghl/programacao-stages";
import { tinyV3Request } from "@/lib/tiny/v3-client";
import {
  montarResumo,
  parseSoladoDescricao,
  SOLADO_STAGE_TITLES_ATENDIMENTO,
  SOLADO_STAGE_TITLES_REPRESENTANTES,
  type SoladoCor,
  type SoladoItemDemanda,
  type SoladoNegocio,
  type SoladoResumo,
  type SoladoSkuTiny,
} from "./solados";

const CACHE_MS = 5 * 60 * 1_000;
const LOTE_GHL = 5;

let cache: { resumo: SoladoResumo; lidoEm: string; expiraEm: number } | null =
  null;
let emVoo: Promise<{ resumo: SoladoResumo; lidoEm: string }> | null = null;

async function emLotes<T, R>(
  itens: T[],
  tamanho: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const saida: R[] = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    saida.push(...(await Promise.all(itens.slice(i, i + tamanho).map(fn))));
  }
  return saida;
}

// ── GHL ─────────────────────────────────────────────────────────────────────

function valorDoCampo(entrada: Record<string, unknown>): unknown {
  if ("fieldValue" in entrada) return entrada.fieldValue;
  for (const [chave, valor] of Object.entries(entrada)) {
    if (chave.startsWith("fieldValue")) return valor;
  }
  return null;
}

function quantidadePositiva(valor: unknown): number {
  const numero = Number(String(valor ?? "").replace(",", "."));
  return Number.isFinite(numero) && numero > 0 ? numero : 0;
}

/**
 * O campo de solado do Modelo 3 foi cadastrado com a fieldKey errada
 * (`soladosolado_modelo_1`), então o número do modelo é lido do NOME do campo.
 * Ler da fieldKey faria o Modelo 3 ser contado como Modelo 1.
 */
function numeroDoModeloSolado(definicao: GhlCustomFieldDef): number | null {
  const match = /Solado Modelo (\d+)/i.exec(definicao.name);
  return match ? Number(match[1]) : null;
}

function extrairItens(
  oportunidade: GhlOpportunity,
  definicoes: Map<string, GhlCustomFieldDef>,
): { itens: SoladoItemDemanda[]; paresSemSolado: number } {
  const modelos = new Map<
    number,
    { grade: Map<string, number>; cor: SoladoCor | null }
  >();
  const obterModelo = (numero: number) => {
    const atual = modelos.get(numero);
    if (atual) return atual;
    const criado = { grade: new Map<string, number>(), cor: null };
    modelos.set(numero, criado);
    return criado;
  };

  for (const campo of oportunidade.customFields ?? []) {
    const definicao = definicoes.get(campo.id);
    if (!definicao) continue;
    const chave = definicao.fieldKey.replace(/^opportunity\./, "");
    const valor = valorDoCampo(campo);

    const grade = /^grade_modelo_(\d+)(?:_(?:adulto|infantil))?$/i.exec(chave);
    if (grade) {
      if (!valor || typeof valor !== "object" || Array.isArray(valor)) continue;
      const modelo = obterModelo(Number(grade[1]));
      const rotulos = new Map(
        (definicao.picklistOptions ?? []).flatMap((opcao) =>
          typeof opcao === "string" ? [] : [[opcao.id, opcao.label] as const],
        ),
      );
      for (const [opcaoId, bruto] of Object.entries(
        valor as Record<string, unknown>,
      )) {
        const pares = quantidadePositiva(bruto);
        const numeracao = rotulos.get(opcaoId);
        if (!pares || !numeracao) continue;
        modelo.grade.set(numeracao, (modelo.grade.get(numeracao) ?? 0) + pares);
      }
      continue;
    }

    if (!/solado/i.test(chave)) continue;
    const numero = numeroDoModeloSolado(definicao);
    if (numero === null) continue;
    const texto = typeof valor === "string" ? valor.trim() : "";
    if (texto === "Branco" || texto === "Preto") {
      obterModelo(numero).cor = texto;
    }
  }

  const itens: SoladoItemDemanda[] = [];
  let paresSemSolado = 0;
  for (const modelo of modelos.values()) {
    const total = [...modelo.grade.values()].reduce((a, b) => a + b, 0);
    if (!total) continue;
    if (!modelo.cor) {
      paresSemSolado += total;
      continue;
    }
    for (const [numeracao, pares] of modelo.grade) {
      itens.push({ cor: modelo.cor, numeracao, pares });
    }
  }
  return { itens, paresSemSolado };
}

function campoTexto(
  oportunidade: GhlOpportunity,
  definicoes: Map<string, GhlCustomFieldDef>,
  fieldKey: string,
): string | null {
  for (const campo of oportunidade.customFields ?? []) {
    const definicao = definicoes.get(campo.id);
    if (!definicao) continue;
    if (definicao.fieldKey.replace(/^opportunity\./, "") !== fieldKey) continue;
    const valor = valorDoCampo(campo);
    return typeof valor === "string" && valor.trim() ? valor.trim() : null;
  }
  return null;
}

async function lerNegociosGhl(): Promise<SoladoNegocio[]> {
  const [definicoesLista, pipelines] = await Promise.all([
    fetchCustomFieldDefs("opportunity"),
    fetchGhlPipelines(),
  ]);
  const definicoes = new Map(definicoesLista.map((d) => [d.id, d]));

  const etapas: Array<{
    pipeline: string;
    etapa: string;
    pipelineId: string;
    stageId: string;
  }> = [];
  for (const pipeline of pipelines) {
    const estagios = pipeline.stages ?? [];
    const nome = normalizeStageTitle(pipeline.name);
    const permitidas = nome.includes("atendimento")
      ? SOLADO_STAGE_TITLES_ATENDIMENTO
      : nome.includes("representante")
        ? SOLADO_STAGE_TITLES_REPRESENTANTES
        : // A Fábrica de Mockups conta inteira: um pedido ganho pode estar
          // parado em qualquer etapa dela enquanto a arte é feita.
          nome.includes("mockup")
          ? estagios.map((etapa) => etapa.name)
          : null;
    if (!permitidas) continue;
    const alvo = new Set(permitidas.map(normalizeStageTitle));
    for (const etapa of estagios) {
      if (!alvo.has(normalizeStageTitle(etapa.name))) continue;
      etapas.push({
        pipeline: pipeline.name,
        etapa: etapa.name,
        pipelineId: pipeline.id,
        stageId: etapa.id,
      });
    }
  }

  const resumos = await emLotes(etapas, LOTE_GHL, async (etapa) => {
    const oportunidades = await searchGhlOpportunitiesByStage(
      etapa.pipelineId,
      etapa.stageId,
      "won",
    );
    return oportunidades.map((oportunidade) => ({ etapa, id: oportunidade.id }));
  });

  // A busca por etapa não devolve os campos TEXTBOX_LIST — a grade só existe
  // na leitura por id. Sem isso o pedido apareceria com zero pares.
  const unicos = new Map(
    resumos.flat().map((item) => [item.id, item.etapa] as const),
  );
  const detalhes = await emLotes(
    [...unicos.keys()],
    LOTE_GHL,
    fetchOpportunityById,
  );

  return detalhes.map((oportunidade) => {
    const etapa = unicos.get(oportunidade.id)!;
    const { itens, paresSemSolado } = extrairItens(oportunidade, definicoes);
    return {
      dealId: oportunidade.id,
      nome: oportunidade.name.trim(),
      pipeline: etapa.pipeline,
      etapa: etapa.etapa,
      dataEmbarque: campoTexto(oportunidade, definicoes, "data_de_embarque"),
      itens,
      paresSemSolado,
    };
  });
}

// ── Tiny ────────────────────────────────────────────────────────────────────

type TinyProdutoItem = { id: number; descricao?: string | null };

async function lerSkusTiny(): Promise<SoladoSkuTiny[]> {
  const lista = await tinyV3Request<{ itens?: TinyProdutoItem[] }>("/produtos", {
    params: { nome: "SOLA SLIDE", limit: "100" },
  });

  const candidatos = (lista.itens ?? []).flatMap((item) => {
    const parsed = parseSoladoDescricao(item.descricao);
    return parsed ? [{ ...parsed, id: item.id, descricao: item.descricao! }] : [];
  });

  // Leitura sequencial: em paralelo o Tiny devolve 429 para a maior parte das
  // 36 chamadas. São ~13 segundos, absorvidos pelo cache.
  const skus: SoladoSkuTiny[] = [];
  for (const candidato of candidatos) {
    const estoque = await tinyV3Request<{ saldo?: number | null }>(
      `/estoque/${candidato.id}`,
    );
    const produto = await tinyV3Request<{
      estoque?: { minimo?: number | null } | null;
    }>(`/produtos/${candidato.id}`);

    // Saldo ausente não pode virar zero: a tela mandaria comprar o estoque
    // inteiro de novo. Falha alto em vez de sugerir compra errada.
    const saldo = Number(estoque.saldo);
    if (!Number.isFinite(saldo)) {
      throw new Error(
        `O Tiny não devolveu o saldo de ${candidato.descricao.trim()}.`,
      );
    }

    skus.push({
      produtoId: candidato.id,
      descricao: candidato.descricao.trim(),
      cor: candidato.cor,
      numeracao: candidato.numeracao,
      saldo,
      minimo: Number(produto.estoque?.minimo ?? 0),
    });
  }
  return skus;
}

// ── Orquestração ────────────────────────────────────────────────────────────

export async function getResumoSolados(
  opcoes: { forcar?: boolean } = {},
): Promise<{ resumo: SoladoResumo; lidoEm: string }> {
  if (!opcoes.forcar && cache && cache.expiraEm > Date.now()) {
    return { resumo: cache.resumo, lidoEm: cache.lidoEm };
  }
  if (emVoo) return emVoo;

  emVoo = (async () => {
    const [negocios, skus] = await Promise.all([
      lerNegociosGhl(),
      lerSkusTiny(),
    ]);

    const resumo = montarResumo({ negocios, skus });
    const lidoEm = new Date().toISOString();
    cache = { resumo, lidoEm, expiraEm: Date.now() + CACHE_MS };
    return { resumo, lidoEm };
  })();

  try {
    return await emVoo;
  } finally {
    emVoo = null;
  }
}
