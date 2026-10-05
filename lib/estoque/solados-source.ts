/**
 * Estoque de solados: GHL e Tiny gravados quando mudam, servidos do banco.
 *
 * Ler tudo ao vivo custava ~100 chamadas a cada tela aberta. Agora:
 *   - GHL: o webhook de oportunidade regrava só aquele negócio
 *     (`sincronizarNegocioSolados`), com a mesma regra da varredura completa
 *     (`etapasAlvo` + `montarNegocio`);
 *   - Tiny: saldo e compras são relidos juntos (`atualizarTinySolados`) quando
 *     uma OC muda pelo dashboard, no botão Atualizar, ou quando alguém abre a
 *     tela e a última leitura passou de cinco minutos — em segundo plano,
 *     servindo a leitura anterior com a hora dela enquanto isso.
 * O botão Atualizar também refaz a varredura do GHL, corrigindo o que um
 * webhook perdido tenha deixado para trás. O cálculo não mudou: `montarResumo`
 * recebe as mesmas entradas, só que guardadas.
 */

import {
  fetchCustomFieldDefs,
  fetchGhlPipelines,
  fetchOpportunityById,
  searchGhlOpportunitiesByStage,
  type GhlCustomFieldDef,
  type GhlDealContext,
  type GhlOpportunity,
} from "@/lib/ghl/api";
import { createClient } from "@supabase/supabase-js";
import { normalizeStageTitle } from "@/lib/ghl/programacao-stages";
import { getSupabaseSecretKey } from "@/lib/supabase/keys-server";
import { paresACaminho } from "./ordem-compra";
import { lerCompras } from "./ordem-compra-source";
import { tinyV3Request } from "@/lib/tiny/v3-client";
import {
  montarResumo,
  parseSoladoDescricao,
  SOLADO_PARAMETROS_PADRAO,
  SOLADO_STAGE_TITLES_ATENDIMENTO,
  SOLADO_STAGE_TITLES_REPRESENTANTES,
  type SoladoCor,
  type SoladoItemDemanda,
  type SoladoNegocio,
  type SoladoResumo,
  type SoladoSkuTiny,
} from "./solados";

/** Mesma validade do antigo cache em memória. */
const VALIDADE_TINY_MS = 5 * 60 * 1_000;
const LOTE_GHL = 5;

/**
 * Uma leitura, um instante.
 *
 * **`skus` (saldo) e `aCaminho` TÊM de vir do mesmo momento.** Receber uma
 * entrega move a mesma quantidade de um para o outro: a nota some de "a
 * caminho" e aparece no saldo do Tiny. Lendo os dois em instantes diferentes,
 * esse par de pares ou some das duas colunas ou aparece nas duas.
 *
 * Em 22/09 aconteceu o primeiro caso. As ordens ficavam fora do cache — para
 * uma OC nova aparecer na hora — então o saldo vinha de cinco minutos atrás,
 * sem a entrega, e "a caminho" já vinha zerado, com ela. Os 1.002 pares da OC 3
 * ficaram invisíveis nas duas pontas e a tela mandou comprar 1.557 em vez de
 * 767 — o dobro, do material que tinha acabado de chegar.
 *
 * Por isso os dois são lidos na mesma leitura e gravados no mesmo `update`.
 * OC nova criada pelo dashboard dispara uma releitura; criada direto no Tiny,
 * aparece na próxima releitura ou no botão Atualizar. É uma espera visível e
 * corrigível, diferente de um número errado que ninguém tem como desconfiar.
 */
type LeituraTiny = {
  skus: SoladoSkuTiny[];
  aCaminho: SoladoItemDemanda[];
};

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

type EtapaAlvo = {
  pipeline: string;
  etapa: string;
  pipelineId: string;
  stageId: string;
};

type DefinicoesGhl = Map<string, GhlCustomFieldDef>;
type PipelinesGhl = Awaited<ReturnType<typeof fetchGhlPipelines>>;

/** As etapas cujos negócios GANHOS são demanda de solado. */
function etapasAlvo(pipelines: PipelinesGhl): EtapaAlvo[] {
  const etapas: EtapaAlvo[] = [];
  for (const pipeline of pipelines) {
    const estagios = pipeline.stages ?? [];
    const nome = normalizeStageTitle(pipeline.name);
    const permitidas = nome.includes("atendimento")
      ? SOLADO_STAGE_TITLES_ATENDIMENTO
      : nome.includes("representante")
        ? SOLADO_STAGE_TITLES_REPRESENTANTES
        : // A Fábrica de Mockups conta inteira, e quem faz o corte aqui é o
          // filtro de GANHO, não a lista de etapas.
          //
          // Ela não é um pipeline de venda: é a fila de trabalho dos designers.
          // "Criar Mockup", "Alteração" e "Mockup PRIORIDADE" são demanda
          // pré-venda e vivem ali como `open`, então ficam de fora sozinhas.
          // Negócio ganho só aparece depois do Cadastro ERP, levado por
          // automação para "Criar Arquivo Serigrafia" — etapa de produção, com
          // a arte já aprovada. Por isso não existe aqui o dado provisório que
          // mantém as etapas anteriores do Atendimento fora da janela.
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
  return etapas;
}

function montarNegocio(
  oportunidade: GhlOpportunity,
  etapa: EtapaAlvo,
  definicoes: DefinicoesGhl,
): SoladoNegocio {
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
}

/**
 * Varredura completa: busca cada etapa-alvo e lê cada negócio por id. É a
 * referência — o webhook aplica a mesma regra (`etapasAlvo` + `montarNegocio`)
 * a um negócio de cada vez, e o botão Atualizar volta a varrer tudo.
 */
async function lerNegociosGhl(): Promise<SoladoNegocio[]> {
  const [definicoesLista, pipelines] = await Promise.all([
    fetchCustomFieldDefs("opportunity"),
    fetchGhlPipelines(),
  ]);
  const definicoes = new Map(definicoesLista.map((d) => [d.id, d]));
  const etapas = etapasAlvo(pipelines);

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

  return detalhes.map((oportunidade) =>
    montarNegocio(oportunidade, unicos.get(oportunidade.id)!, definicoes),
  );
}

/**
 * O negócio como a varredura o veria, a partir de uma oportunidade já lida
 * por id. `null` quando ele não é demanda: não ganho, ou fora das etapas-alvo.
 * Mesmo critério da busca da varredura — status `won` na etapa.
 */
export function negocioDoContexto(contexto: GhlDealContext): SoladoNegocio | null {
  const { opportunity, definitions, pipelines } = contexto;
  if (opportunity.status !== "won") return null;
  const etapa = etapasAlvo(pipelines).find(
    (alvo) =>
      alvo.pipelineId === opportunity.pipelineId &&
      alvo.stageId === opportunity.pipelineStageId,
  );
  if (!etapa) return null;
  return montarNegocio(
    opportunity,
    etapa,
    new Map(definitions.map((d) => [d.id, d])),
  );
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
  // chamadas. São ~7 segundos, fora do caminho da tela.
  const skus: SoladoSkuTiny[] = [];
  for (const candidato of candidatos) {
    const estoque = await tinyV3Request<{ saldo?: number | null }>(
      `/estoque/${candidato.id}`,
    );

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
    });
  }
  return skus;
}

/**
 * Consumo médio mensal em pares, pelos embarques dos últimos meses fechados.
 *
 * Vem do `deals_cache` e não do GHL porque aqui só interessa o VOLUME, que está
 * na tabela e é barato. A quebra por numeração e cor não existe no histórico —
 * os campos de grade entraram em 21/08/2026 — e por isso a curva sai da janela
 * atual, com teto por pedido.
 */
async function lerConsumoMensalMedio(meses = 6): Promise<number> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = getSupabaseSecretKey();
  if (!supabaseUrl || !chave) return 0;

  const inicio = new Date();
  inicio.setDate(1);
  inicio.setMonth(inicio.getMonth() - meses);
  const desde = inicio.toISOString().slice(0, 10);
  // O mês corrente fica de fora: ainda não fechou e puxaria a média para baixo.
  const fim = new Date();
  fim.setDate(1);
  const ate = fim.toISOString().slice(0, 10);

  const url =
    `${supabaseUrl}/rest/v1/deals_cache` +
    `?select=quantidade-de-pares&status=eq.won` +
    `&data_embarque_date=gte.${desde}&data_embarque_date=lt.${ate}`;

  const resposta = await fetch(url, {
    headers: { apikey: chave, Authorization: `Bearer ${chave}` },
    cache: "no-store",
  });
  if (!resposta.ok) return 0;

  const linhas = (await resposta.json()) as Array<Record<string, unknown>>;
  const total = linhas.reduce((soma, linha) => {
    const bruto = Number(linha["quantidade-de-pares"]);
    return soma + (Number.isFinite(bruto) && bruto > 0 ? bruto : 0);
  }, 0);
  return meses > 0 ? Math.round(total / meses) : 0;
}

// ── Armazenamento ───────────────────────────────────────────────────────────

const TABELA_NEGOCIOS = "estoque_solados_negocios";
const TABELA_ESTADO = "estoque_solados_estado";
/** Mesmo prazo da reserva no banco: leitura parada há mais que isso morreu. */
const LEITURA_TRAVADA_MS = 5 * 60 * 1_000;
const ESPERA_LEITURA_MS = 2_000;

type EstadoSolados = {
  skus: SoladoSkuTiny[] | null;
  a_caminho: SoladoItemDemanda[] | null;
  tiny_lido_em: string | null;
  ghl_varrido_em: string | null;
  sujo: boolean;
  leitura_iniciada_em: string | null;
};

type ClienteServico = ReturnType<typeof clienteServico>;

function clienteServico() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL não configurada.");
  return createClient(url, getSupabaseSecretKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function lerEstado(supabase: ClienteServico): Promise<EstadoSolados> {
  const { data, error } = await supabase
    .from(TABELA_ESTADO)
    .select(
      "skus,a_caminho,tiny_lido_em,ghl_varrido_em,sujo,leitura_iniciada_em",
    )
    .eq("id", 1)
    .single();
  if (error) throw new Error(`Estado do estoque de solados: ${error.message}`);
  return data as EstadoSolados;
}

/**
 * Em ordem de `deal_id`, para o resultado não depender da ordem de gravação.
 * A ordem só pesa na curva, que soma em ponto flutuante — a verificação de
 * equivalência compara contra a ordem da varredura.
 */
async function lerNegociosGravados(
  supabase: ClienteServico,
): Promise<SoladoNegocio[]> {
  const { data, error } = await supabase
    .from(TABELA_NEGOCIOS)
    .select("negocio")
    .order("deal_id");
  if (error) throw new Error(`Negócios do estoque de solados: ${error.message}`);
  return (data ?? []).map((linha) => linha.negocio as SoladoNegocio);
}

// ── GHL por evento ──────────────────────────────────────────────────────────

/**
 * Aplica um webhook de oportunidade. Recebe a oportunidade já lida por id —
 * a única leitura com a grade — para não repetir a chamada ao GHL.
 */
export async function sincronizarNegocioSolados(
  contexto: GhlDealContext,
): Promise<void> {
  const negocio = negocioDoContexto(contexto);
  if (!negocio) return removerNegocioSolados(contexto.opportunity.id);

  const { error } = await clienteServico()
    .from(TABELA_NEGOCIOS)
    .upsert(
      {
        deal_id: negocio.dealId,
        negocio,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "deal_id" },
    );
  if (error) throw new Error(`Gravar negócio ${negocio.dealId}: ${error.message}`);
}

export async function removerNegocioSolados(dealId: string): Promise<void> {
  const { error } = await clienteServico()
    .from(TABELA_NEGOCIOS)
    .delete()
    .eq("deal_id", dealId);
  if (error) throw new Error(`Remover negócio ${dealId}: ${error.message}`);
}

/**
 * Varredura completa gravada por cima. Só apaga o que estava gravado ANTES de
 * ela começar: um negócio que entrou por webhook durante a varredura fica.
 */
async function varrerNegociosGhl(): Promise<void> {
  const inicio = new Date().toISOString();
  const negocios = await lerNegociosGhl();
  const supabase = clienteServico();

  if (negocios.length > 0) {
    const agora = new Date().toISOString();
    const { error } = await supabase.from(TABELA_NEGOCIOS).upsert(
      negocios.map((negocio) => ({
        deal_id: negocio.dealId,
        negocio,
        atualizado_em: agora,
      })),
      { onConflict: "deal_id" },
    );
    if (error) throw new Error(`Gravar varredura do GHL: ${error.message}`);
  }

  const { data: antigos, error: erroAntigos } = await supabase
    .from(TABELA_NEGOCIOS)
    .select("deal_id")
    .lt("atualizado_em", inicio);
  if (erroAntigos) throw new Error(`Ler negócios antigos: ${erroAntigos.message}`);
  const atuais = new Set(negocios.map((negocio) => negocio.dealId));
  const sairam = (antigos ?? [])
    .map((linha) => linha.deal_id as string)
    .filter((id) => !atuais.has(id));
  if (sairam.length > 0) {
    const { error } = await supabase
      .from(TABELA_NEGOCIOS)
      .delete()
      .in("deal_id", sairam);
    if (error) throw new Error(`Remover negócios que saíram: ${error.message}`);
  }

  const { error } = await supabase
    .from(TABELA_ESTADO)
    .update({ ghl_varrido_em: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw new Error(`Marcar varredura do GHL: ${error.message}`);
}

// ── Tiny por snapshot ───────────────────────────────────────────────────────

/** A leitura de sempre: saldos e compras juntos, ver `LeituraTiny`. */
async function lerTiny(): Promise<LeituraTiny> {
  const [skus, compras] = await Promise.all([lerSkusTiny(), lerCompras()]);
  return { skus, aCaminho: paresACaminho(compras.consolidado) };
}

/**
 * Relê o Tiny e grava saldo e "a caminho" no mesmo `update`.
 *
 * Uma leitura por vez entre todas as instâncias, pela reserva no banco: duas
 * ao mesmo tempo disputariam o limite de chamadas do Tiny.
 * - `evento`: algo mudou no Tiny. Se outra leitura já corre, marca `sujo` e
 *   ela relê ao terminar — pode ter lido o saldo antes da mudança.
 * - `esperar`: quem precisa do dado agora espera a leitura em curso terminar.
 *   "nova" (botão Atualizar) lê de novo depois dela — a que corria pode ter
 *   começado antes da mudança que motivou o clique. "qualquer" (primeira
 *   abertura) se contenta com ela, sem uma segunda leitura do Tiny.
 */
export async function atualizarTinySolados(
  opcoes: { evento?: boolean; esperar?: "nova" | "qualquer" } = {},
): Promise<void> {
  const supabase = clienteServico();
  const prazo = Date.now() + LEITURA_TRAVADA_MS;

  // Teto de releituras: eventos sem fim não prendem uma instância. O `sujo`
  // que sobrar faz a próxima abertura da tela reler.
  for (let leituras = 0; leituras < 3; ) {
    const { data: reservou, error } = await supabase.rpc(
      "try_claim_estoque_solados_tiny",
    );
    if (error) throw new Error(`Reservar leitura do Tiny: ${error.message}`);

    if (!reservou) {
      if (!opcoes.esperar) {
        if (opcoes.evento) {
          await supabase.from(TABELA_ESTADO).update({ sujo: true }).eq("id", 1);
        }
        return;
      }
      if (Date.now() > prazo) {
        throw new Error("Outra leitura do Tiny está em andamento há tempo demais.");
      }
      await new Promise((resolve) => setTimeout(resolve, ESPERA_LEITURA_MS));
      if (opcoes.esperar === "qualquer") {
        const estado = await lerEstado(supabase);
        if (estado.tiny_lido_em && !estado.leitura_iniciada_em) return;
      }
      continue;
    }
    leituras += 1;

    let leitura: LeituraTiny;
    try {
      leitura = await lerTiny();
    } catch (erro) {
      await supabase
        .from(TABELA_ESTADO)
        .update({ leitura_iniciada_em: null })
        .eq("id", 1);
      throw erro;
    }

    const { data, error: erroGravar } = await supabase
      .from(TABELA_ESTADO)
      .update({
        skus: leitura.skus,
        a_caminho: leitura.aCaminho,
        tiny_lido_em: new Date().toISOString(),
        leitura_iniciada_em: null,
      })
      .eq("id", 1)
      .select("sujo")
      .single();
    if (erroGravar) throw new Error(`Gravar leitura do Tiny: ${erroGravar.message}`);
    if (!data.sujo) return;
  }
}

// ── Leitura da tela ─────────────────────────────────────────────────────────

/**
 * O resumo a partir do que está gravado.
 *
 * `revalidar` diz à rota para reler o Tiny em segundo plano (`after`): a
 * última leitura passou da validade ou ficou um evento pendente. A tela recebe
 * `atualizando` e busca de novo até a leitura terminar.
 */
export async function getResumoSolados(
  opcoes: { forcar?: boolean } = {},
): Promise<{
  resumo: SoladoResumo;
  lidoEm: string;
  atualizando: boolean;
  revalidar: boolean;
}> {
  const supabase = clienteServico();

  if (opcoes.forcar) {
    await Promise.all([
      varrerNegociosGhl(),
      atualizarTinySolados({ evento: true, esperar: "nova" }),
    ]);
  }

  let [estado, negocios] = await Promise.all([
    lerEstado(supabase),
    lerNegociosGravados(supabase),
  ]);

  // Primeira abertura depois da implantação: ainda não há o que servir.
  if (!estado.ghl_varrido_em || !estado.tiny_lido_em) {
    await Promise.all([
      estado.ghl_varrido_em ? null : varrerNegociosGhl(),
      estado.tiny_lido_em
        ? null
        : atualizarTinySolados({ evento: true, esperar: "qualquer" }),
    ]);
    [estado, negocios] = await Promise.all([
      lerEstado(supabase),
      lerNegociosGravados(supabase),
    ]);
  }

  if (!estado.skus || !estado.a_caminho || !estado.tiny_lido_em) {
    throw new Error("A leitura do Tiny não foi gravada.");
  }

  const consumoMensalMedio = await lerConsumoMensalMedio();

  const lendo =
    estado.leitura_iniciada_em !== null &&
    Date.now() - Date.parse(estado.leitura_iniciada_em) < LEITURA_TRAVADA_MS;
  const revalidar =
    !lendo &&
    (estado.sujo ||
      Date.now() - Date.parse(estado.tiny_lido_em) > VALIDADE_TINY_MS);

  const resumo = montarResumo({
    negocios,
    skus: estado.skus,
    aCaminho: estado.a_caminho,
    parametros: {
      ...SOLADO_PARAMETROS_PADRAO,
      consumoMensalMedio,
    },
  });
  return {
    resumo,
    lidoEm: estado.tiny_lido_em,
    atualizando: lendo || revalidar,
    revalidar,
  };
}

/**
 * Só para a verificação de equivalência (scripts/verificar-estoque-solados):
 * as leituras ao vivo, sem gravar nada.
 */
export const leiturasAoVivo = {
  lerNegociosGhl,
  lerTiny,
  lerConsumoMensalMedio,
};
