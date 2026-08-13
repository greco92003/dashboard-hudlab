// Supabase Edge Function: meta-ghl-insights
// Recomendação diária gerada por IA (Claude), por anúncio, pro módulo
// Meta Marketing GHL -- complementa o badge "Diagnóstico" (GERA VENDA/
// LEAD BARATO VENDA CARA/REVISAR) já calculado em get_funnel_por_anuncio
// com um veredito mais rico (ESCALAR/MANTER/REVISAR/PAUSAR) e uma
// justificativa escrita, olhando pra todos os anúncios relevantes de uma
// vez (mesmo padrão do Estrategista em ig-inteligencia: 1 chamada, JSON
// em lote -- não 1 chamada por anúncio).
//
// Secrets necessários:
//   ANTHROPIC_API_KEY - console.anthropic.com -> Chaves de API
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODELO = "claude-sonnet-5";
const VEREDITOS_VALIDOS = new Set(["ESCALAR", "MANTER", "REVISAR", "PAUSAR"]);
// Janela de análise: 30 dias é estável o bastante pra não reagir a
// ruído diário, mas recente o bastante pra refletir o anúncio como está
// agora. Ignora anúncios com investimento muito baixo -- não há dado
// suficiente pra um veredito com evidência real.
const JANELA_DIAS = 30;
const SPEND_MINIMO = 20;

interface FunnelRow {
  ad_id: string;
  ad_name: string | null;
  campaign_name: string | null;
  adset_id: string | null;
  spend_total: number;
  impressoes: number;
  cliques: number;
  leads_ghl: number;
  orcamentos: number;
  valor_orcamentos: number;
  pares_orcamentos: number;
  mockups: number;
  negociacoes: number;
  vendas: number;
  faturamento: number;
  custo_por_lead: number | null;
  custo_por_orcamento: number | null;
  custo_por_mockup: number | null;
  custo_por_negociacao: number | null;
  cpa_venda: number | null;
  roas: number | null;
  diagnostico: string;
}

interface AdAttributesRow {
  ad_id: string;
  effective_status: string | null;
  campaign_objective: string | null;
  adset_optimization_goal: string | null;
  adset_destination_type: string | null;
}

// Status que indicam que o anúncio (ou o conjunto/campanha dele) já
// está pausado no Meta -- não faz sentido o Claude sugerir "PAUSAR"
// de novo pra esses.
const STATUS_PAUSADO = new Set(["PAUSED", "ADSET_PAUSED", "CAMPAIGN_PAUSED"]);

// Nem todo anúncio ativo é otimizado pra gerar lead direto -- julgar
// todos pelo mesmo CPL/orçamento penaliza injustamente quem o Meta
// nunca tentou converter em primeiro lugar. Achado em 2026-08-13
// (usuário notou 2 anúncios reais, "WEBSITE"/LINK_CLICKS, gastando
// dinheiro com 0 leads sem nenhuma flag de exceção): a categoria
// binária antiga só cobria "tráfego de perfil" -- ampliada pra cobrir
// os objetivos reais observados na conta.
type CategoriaObjetivo = "lead_direto" | "trafego_perfil" | "trafego_link" | "engajamento";

function classificarObjetivo(attr: AdAttributesRow | undefined): CategoriaObjetivo {
  if (!attr) return "lead_direto";
  if (
    attr.adset_destination_type === "INSTAGRAM_PROFILE" ||
    (attr.campaign_objective === "OUTCOME_TRAFFIC" && attr.adset_optimization_goal === "PROFILE_VISIT")
  ) {
    return "trafego_perfil";
  }
  if (attr.campaign_objective === "OUTCOME_ENGAGEMENT") {
    return "engajamento";
  }
  if (attr.adset_optimization_goal === "LINK_CLICKS") {
    return "trafego_link";
  }
  return "lead_direto";
}

const CONTEXTO_NEGOCIO = `Você é um especialista sênior em tráfego pago no Meta Ads (Facebook/
Instagram), com conhecimento profundo de como o algoritmo de entrega e
otimização de orçamento da plataforma funciona na prática -- não só um
analista que lê números, mas alguém que entende o "porquê" por trás
deles. Você atua como analista de performance pra Hud Lab, empresa de
Chinelo Slide personalizado (venda B2B/em lote pra marcas, empresas,
times e eventos -- não é venda unitária pro consumidor final).

Conhecimento de plataforma que você deve aplicar (não é regra de
negócio, é mecânica real do Meta Ads):
- CBO (Campaign Budget Optimization) / Advantage Campaign Budget aloca
  verba em tempo real entre os anúncios de um mesmo conjunto/campanha
  com base no valor previsto pelo próprio algoritmo do Meta. Se
  "investimento_diario" mostra queda de investimento nos dias mais
  recentes depois de ter sido alto no início da janela, isso geralmente
  significa que o PRÓPRIO META já detectou desempenho fraco e reduziu a
  entrega sozinho -- é o problema já sendo corrigido automaticamente
  pela plataforma, não motivo pra reforçar com "PAUSAR" manual (seria
  redundante). Isso é especialmente relevante quando o anúncio tem
  "irmaos_no_mesmo_conjunto" -- o Meta está literalmente redirecionando
  a verba pra eles.
- Fase de aprendizado (learning phase): um anúncio novo ou recém-
  editado precisa acumular um volume mínimo de eventos de otimização
  pra sair da fase de aprendizado (referência do próprio Meta: ~50 por
  semana no conjunto de anúncios). Durante essa fase, custo e entrega
  são naturalmente instáveis/piores -- não penalize um anúncio com
  poucos dias de veiculação ou volume baixo como se já tivesse
  maturidade de entrega.
- Fadiga de criativo: desempenho ruim CONSISTENTE ao longo de várias
  semanas seguidas em "funil_semanal" (não só uma semana isolada) é
  sinal bem mais forte de fadiga real do que uma variação pontual.

Como ler os dados de tendência fornecidos (evite julgar só pelo total
flat da janela de 30 dias -- use a curva real):
- "investimento_diario": investimento dia a dia, toda a janela,
  incluindo dias com R$0 se o anúncio não rodou. Distinga: (a) alto no
  início e caindo nos dias recentes = Meta já corrigindo sozinho (ver
  acima), não é motivo extra pra pausar; (b) alto e ruim o período
  inteiro sem queda = problema real, sem sinal de autocorreção; (c)
  subindo agora nos dias mais recentes = sinal recente, ainda é cedo
  pra julgar com confiança.
- "funil_semanal": leads/orçamentos/mockups/negociações/vendas
  agrupados por semana dentro da janela, da mais antiga pra mais
  recente. Distinga funil genuinamente estagnado (achatado ou caindo em
  TODAS as semanas) de funil ainda amadurecendo (leads/orçamentos/
  mockups subindo nas últimas semanas -- ainda não deu tempo de virar
  negociação/venda dado o ciclo de ~35 dias, isso é maturação, não
  anúncio ruim).

Regras de negócio importantes pra avaliar os anúncios corretamente:
- CAC/CPA é sempre medido POR PEDIDO fechado, nunca por par individual
  (um pedido tem dezenas de pares).
- PRIORIZE eficiência de custo POR ETAPA do funil (custo_por_lead,
  custo_por_orcamento, custo_por_par_orcado, custo_por_negociacao) como
  critério PRINCIPAL de avaliação -- é o sinal mais maduro e confiável
  que temos hoje. Trate ROAS e vendas como sinal SECUNDÁRIO, ainda em
  maturação: o ciclo de venda é longo (~35 dias do lead até o
  fechamento). Não julgue "PAUSAR" nem penalize um anúncio só por ROAS
  baixo ou vendas=0 se as etapas anteriores do funil estão custando bem
  e em volume saudável, e "funil_semanal" mostra crescimento recente --
  isso é maturação do funil, não anúncio ruim. Com mais janelas de
  dados no futuro o ROAS/vendas ganha mais peso; por enquanto avalie
  por partes, etapa por etapa, sempre cruzando com a tendência.
- ROAS >= 2x é considerado bom pro negócio quando já há maturidade
  suficiente de dado (funil rodando há tempo, sem pico recente de topo
  em "funil_semanal"). Abaixo disso, olhe o resto do funil antes de
  decidir.
- "categoria_objetivo" diz pra que o Meta está OTIMIZANDO cada
  anúncio -- julgue cada categoria pelo critério certo, nunca todas
  pelo mesmo CPL/custo_por_orcamento:
  - "lead_direto": objetivo é geração de lead/conversão -- é o padrão,
    julgue normalmente por todas as etapas do funil como já descrito
    acima.
  - "trafego_perfil": campanha de tráfego com destino "visita ao
    perfil do Instagram" (BIO), não geração de lead direta -- o
    próprio Meta otimiza pra isso, não pra conversão. NÃO avalie pelo
    número de leads/orçamentos atribuídos diretamente a esse ad_id:
    quem entra pela bio e depois vira lead orgânico não fica atribuído
    a esse anúncio específico no nosso rastreamento (limitação de
    atribuição conhecida, não sinal de mau desempenho). Avalie pelo
    custo de alcance/cliques ("impressoes"/"cliques" no payload, CPM e
    CPC implícitos) como canal de topo de funil/marca, e considere
    "MANTER" mesmo com leads/orçamentos diretos baixos ou zero,
    contanto que o custo de alcance não esteja desproporcional.
  - "trafego_link": otimizado pra CLIQUE NO LINK, não pra conversão --
    o Meta entrega pra quem tem mais chance de clicar, não de virar
    lead. Mesma lógica do trafego_perfil (não penalize por leads
    baixos/zero), mas julgue pelo custo por clique (investimento /
    cliques) em vez de custo de alcance -- um anúncio assim com CPC
    muito acima de "benchmark_conta.cpc_medio" é sinal real de
    problema, mesmo sem nenhum lead esperado.
  - "engajamento": otimizado pra visualização/engajamento de vídeo
    (THRUPLAY), sem relação nenhuma com clique ou lead -- é mídia de
    reconhecimento de marca pura. Não penalize por cliques, leads ou
    orçamentos baixos/zero; julgue só pelo CPM implícito (investimento
    / impressões) contra "benchmark_conta.cpm_medio" -- muito acima
    disso é o único motivo válido pra "REVISAR"/"PAUSAR" aqui.
  IMPORTANTE sobre "razoável"/"bom"/"alto demais" nas 3 categorias
  acima: SEMPRE compare contra "benchmark_conta" (fornecido no payload,
  calculado da própria conta nos últimos 30 dias) -- NUNCA contra
  benchmark de mercado genérico do seu conhecimento geral (CPC/CPM
  "típico" de mercado varia demais por país/nicho/público pra ser
  confiável aqui, e pode estar desatualizado). Cite o número real da
  conta na justificativa (ex.: "CPC de R$0,21 vs. média da conta de
  R$0,60 -- 65% mais barato"), nunca uma afirmação vaga tipo "custo
  razoável" sem o número de comparação.
- "Leads" já é a coorte de contatos GHL atribuídos a esse anúncio
  específico no período; "Orçamentos"/"Mockups"/"Negociações" são
  marcos alcançados por essa mesma coorte.
- Quando o anúncio tem "irmaos_no_mesmo_conjunto" (outros anúncios
  ativos no MESMO conjunto de anúncios, dividindo orçamento e leilão),
  considere o risco de portfólio antes de sugerir "PAUSAR": o Meta
  aloca verba entre os anúncios de um mesmo conjunto com base em valor
  previsto em tempo real, mas mantém uma fatia de exploração pra manter
  calibração e variar criativo pro mesmo usuário (evitar fadiga de
  frequência). Pausar um anúncio fraco isolado nesse conjunto pode
  forçar todo o conjunto a recalibrar e prejudicar temporariamente os
  outros criativos, inclusive os fortes. Se pelo menos um irmão tem bom
  desempenho (ROAS >= 2, custo_por_negociacao baixo ou vendas > 0) e
  ainda não está pausado, prefira "REVISAR" a "PAUSAR" pro anúncio
  fraco, e explique esse motivo na justificativa. Se todos os irmãos
  também têm desempenho ruim ou já estão pausados, aí sim "PAUSAR" é
  seguro.

Sua tarefa: pra cada anúncio da lista fornecida, decida um veredito e
escreva uma justificativa curta (2-3 frases, cite os números que
embasam a decisão).

Vereditos possíveis:
- "ESCALAR": custo por etapa do funil consistentemente bom (lead,
  orçamento, par orçado, negociação) em "funil_semanal", e/ou ROAS alto
  já com dado maduro, vale aumentar verba.
- "MANTER": custo por etapa ok/consistente (pra "lead_direto"), ou
  anúncio de "trafego_perfil"/"trafego_link"/"engajamento" com o custo
  certo pra categoria dele (alcance, clique ou CPM, respectivamente)
  dentro do razoável, ou anúncio ainda em fase de aprendizado/
  maturação com sinal recente positivo -- não há motivo pra mudar
  agora.
- "REVISAR": sinal misto ou dado insuficiente pra decidir com
  confiança -- precisa de atenção humana, mas não é claramente ruim.
- "PAUSAR": custo por etapa do funil comprovadamente ruim em TODAS as
  semanas de "funil_semanal" (gasto relevante, funil não avança em
  nenhuma etapa, sem sinal de maturação) E "investimento_diario" não
  mostra o Meta já reduzindo a entrega sozinho -- se o Meta já está
  corrigindo automaticamente (ver acima), prefira "REVISAR".

Responda APENAS com um objeto JSON válido, sem cerca de markdown (nada
de crases), sem nenhum texto antes ou depois, exatamente neste formato:
{"itens": [{"ad_id": "...", "veredito": "...", "justificativa": "..."}]}`;

function dataIsoSaoPaulo(offsetDias = 0): string {
  const agora = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }),
  );
  agora.setDate(agora.getDate() + offsetDias);
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(
    agora.getDate(),
  ).padStart(2, "0")}`;
}

// Soma (ou subtrai, com n negativo) dias a uma data YYYY-MM-DD.
function addDiasIso(dataIso: string, n: number): string {
  const d = new Date(`${dataIso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function todasDatasEntre(inicio: string, fim: string): string[] {
  const total = Math.round(
    (new Date(`${fim}T12:00:00`).getTime() - new Date(`${inicio}T12:00:00`).getTime()) / 86400000,
  );
  return Array.from({ length: total + 1 }, (_, i) => addDiasIso(inicio, i));
}

// Divide a janela de análise em N baldes semanais contíguos (mais
// antigo -> mais recente), pra dar visão de tendência ao Claude sem
// depender de um corte arbitrário fixo (7x23, 15x15 etc.) -- ver
// CONTEXTO_NEGOCIO.
const NUM_BALDES_SEMANAIS = 4;
function baldesSemanais(pInicio: string, pFim: string, n: number): { inicio: string; fim: string }[] {
  const totalDias = Math.round(
    (new Date(`${pFim}T12:00:00`).getTime() - new Date(`${pInicio}T12:00:00`).getTime()) / 86400000,
  );
  const baldes: { inicio: string; fim: string }[] = [];
  for (let i = 0; i < n; i++) {
    const offsetInicio = Math.floor((totalDias * i) / n);
    const offsetFim = i === n - 1 ? totalDias : Math.floor((totalDias * (i + 1)) / n) - 1;
    baldes.push({ inicio: addDiasIso(pInicio, offsetInicio), fim: addDiasIso(pInicio, offsetFim) });
  }
  return baldes;
}

// deno-lint-ignore no-explicit-any
async function logSync(supabase: any, source: string, startedAt: Date, rows: number, status: string, error?: string) {
  await supabase.from("sync_log").insert({
    source,
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    rows_upserted: rows,
    status,
    error: error ?? null,
  });
}

function extractJson(text: string): unknown {
  let t = text.trim();
  const cercaFechada = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (cercaFechada) {
    t = cercaFechada[1].trim();
  } else {
    t = t.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "").trim();
  }
  try {
    return JSON.parse(t);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`${msg} -- fim da resposta recebida: "...${t.slice(-200)}"`);
  }
}

async function callClaude(apiKey: string, system: string, userText: string, maxTokens: number): Promise<string> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: [{ type: "text", text: userText }] }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  // deno-lint-ignore no-explicit-any
  const textBlock = (data.content ?? []).find((b: any) => b.type === "text");
  if (!textBlock) throw new Error("Resposta do Claude sem bloco de texto");
  return textBlock.text as string;
}

Deno.serve(async (req: Request) => {
  const syncSecret = Deno.env.get("SYNC_SECRET");
  if (syncSecret && req.headers.get("x-sync-secret") !== syncSecret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const startedAt = new Date();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY não configurado" }), { status: 500 });
  }

  let rows = 0;
  let errMsg: string | undefined;
  try {
    const pFim = dataIsoSaoPaulo(0);
    const pInicio = dataIsoSaoPaulo(-JANELA_DIAS);

    const { data, error } = await supabase.rpc("get_funnel_por_anuncio", {
      p_inicio: pInicio,
      p_fim: pFim,
    });
    if (error) throw new Error(`get_funnel_por_anuncio: ${error.message}`);

    const anuncios = ((data ?? []) as FunnelRow[]).filter(
      (r) => r.ad_name != null && r.spend_total >= SPEND_MINIMO,
    );

    if (anuncios.length === 0) {
      await logSync(supabase, "meta_ghl_insights", startedAt, 0, "success", "nenhum anúncio elegível no período");
      return new Response(JSON.stringify({ rows: 0, mensagem: "nenhum anúncio elegível" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: attrData, error: attrError } = await supabase
      .from("meta_ad_attributes")
      .select("ad_id, effective_status, campaign_objective, adset_optimization_goal, adset_destination_type")
      .in("ad_id", anuncios.map((r) => r.ad_id));
    if (attrError) throw new Error(`meta_ad_attributes: ${attrError.message}`);
    const atributosPorAdId = new Map(
      ((attrData ?? []) as AdAttributesRow[]).map((a) => [a.ad_id, a]),
    );

    // Anúncios já pausados no Meta não passam pelo Claude -- evita
    // sugestão redundante de "PAUSAR" pra algo que já foi pausado (a
    // tabela de funil mantém resquícios de atividade na janela de 30
    // dias mesmo após a pausa).
    const pausados = anuncios.filter((r) =>
      STATUS_PAUSADO.has(atributosPorAdId.get(r.ad_id)?.effective_status ?? ""),
    );
    const paraAvaliar = anuncios.filter(
      (r) => !STATUS_PAUSADO.has(atributosPorAdId.get(r.ad_id)?.effective_status ?? ""),
    );

    const pausadoAdIds = new Set(pausados.map((r) => r.ad_id));

    // Tendência dentro da janela -- em vez de um corte fixo arbitrário
    // (7x23, 15x15), dá pro Claude a curva diária de investimento real
    // (já sincronizada, sem custo extra de API do Meta) e o funil
    // agrupado por semana, pra ele mesmo julgar se um anúncio já está
    // sendo corrigido pelo próprio Meta ou se o funil ainda está
    // amadurecendo (ver CONTEXTO_NEGOCIO).
    const adIdsParaAvaliar = paraAvaliar.map((r) => r.ad_id);

    const { data: diarioData, error: diarioError } = await supabase
      .from("meta_insights_daily")
      .select("ad_id, date, spend")
      .gte("date", pInicio)
      .lte("date", pFim)
      .in("ad_id", adIdsParaAvaliar);
    if (diarioError) throw new Error(`meta_insights_daily: ${diarioError.message}`);

    const investimentoDiarioPorAdId = new Map<string, Map<string, number>>();
    for (const row of (diarioData ?? []) as { ad_id: string; date: string; spend: number }[]) {
      if (!investimentoDiarioPorAdId.has(row.ad_id)) investimentoDiarioPorAdId.set(row.ad_id, new Map());
      const porData = investimentoDiarioPorAdId.get(row.ad_id)!;
      porData.set(row.date, (porData.get(row.date) ?? 0) + (Number(row.spend) || 0));
    }
    const todasDatas = todasDatasEntre(pInicio, pFim);

    // Benchmark real da PRÓPRIA conta (2026-08-13, achado pelo usuário:
    // o prompt pedia comparação contra "média da conta"/"razoável" sem
    // nunca calcular e entregar esse número -- o Claude ficava usando
    // conhecimento genérico de mercado, que não bate com o público/
    // nicho real daqui). CPC/CPM médios de TODOS os anúncios da conta
    // no período (não só os "trafego_link"/"engajamento" avaliados),
    // pra ter uma base estatística maior que os 1-2 anúncios de cada
    // categoria costumam ter isoladamente.
    const { data: contaData, error: contaError } = await supabase
      .from("meta_insights_daily")
      .select("spend, clicks, impressions")
      .gte("date", pInicio)
      .lte("date", pFim);
    if (contaError) throw new Error(`meta_insights_daily (benchmark): ${contaError.message}`);
    let spendConta = 0, cliquesConta = 0, impressoesConta = 0;
    for (const row of (contaData ?? []) as { spend: number; clicks: number; impressions: number }[]) {
      spendConta += Number(row.spend) || 0;
      cliquesConta += Number(row.clicks) || 0;
      impressoesConta += Number(row.impressions) || 0;
    }
    const benchmarkConta = {
      cpc_medio: cliquesConta > 0 ? Math.round((spendConta / cliquesConta) * 100) / 100 : null,
      cpm_medio: impressoesConta > 0 ? Math.round((spendConta / impressoesConta) * 1000 * 100) / 100 : null,
      periodo_dias: JANELA_DIAS,
    };

    const baldes = baldesSemanais(pInicio, pFim, NUM_BALDES_SEMANAIS);
    const resultadosSemanais = await Promise.all(
      baldes.map((b) => supabase.rpc("get_funnel_por_anuncio", { p_inicio: b.inicio, p_fim: b.fim })),
    );
    const funilSemanalPorAdId = new Map<
      string,
      { semana_inicio: string; semana_fim: string; leads: number; orcamentos: number; mockups: number; negociacoes: number; vendas: number }[]
    >();
    for (let i = 0; i < resultadosSemanais.length; i++) {
      const { data: bd, error: be } = resultadosSemanais[i];
      if (be) throw new Error(`get_funnel_por_anuncio (semana ${baldes[i].inicio}): ${be.message}`);
      for (const row of (bd ?? []) as FunnelRow[]) {
        if (!funilSemanalPorAdId.has(row.ad_id)) funilSemanalPorAdId.set(row.ad_id, []);
        funilSemanalPorAdId.get(row.ad_id)!.push({
          semana_inicio: baldes[i].inicio,
          semana_fim: baldes[i].fim,
          leads: row.leads_ghl,
          orcamentos: row.orcamentos,
          mockups: row.mockups,
          negociacoes: row.negociacoes,
          vendas: row.vendas,
        });
      }
    }

    // Agrupa por conjunto de anúncios (adset_id) pra dar visibilidade
    // de risco de portfólio ao Claude -- anúncios que dividem
    // orçamento/leilão com irmãos fortes não devem ser pausados de
    // forma isolada (ver regra "irmaos_no_mesmo_conjunto" no prompt).
    const anunciosPorAdsetId = new Map<string, FunnelRow[]>();
    for (const r of anuncios) {
      if (!r.adset_id) continue;
      const lista = anunciosPorAdsetId.get(r.adset_id) ?? [];
      lista.push(r);
      anunciosPorAdsetId.set(r.adset_id, lista);
    }

    const linhasPausadas = pausados.map((r) => {
      const status = atributosPorAdId.get(r.ad_id)?.effective_status ?? "PAUSED";
      return {
        ad_id: r.ad_id,
        ad_name: r.ad_name,
        campaign_name: r.campaign_name,
        veredito: "PAUSADO",
        justificativa: `Anúncio já está pausado no Meta Ads (status: ${status}) -- sem ação necessária, mantido aqui só pra registro.`,
        periodo_inicio: pInicio,
        periodo_fim: pFim,
        gerado_por: MODELO,
        gerado_em: new Date().toISOString(),
      };
    });

    let linhasAvaliadas: {
      ad_id: string;
      ad_name: string | null;
      campaign_name: string | null;
      veredito: string;
      justificativa: string;
      periodo_inicio: string;
      periodo_fim: string;
      gerado_por: string;
      gerado_em: string;
    }[] = [];

    if (paraAvaliar.length > 0) {
      const contexto = {
        periodo: { inicio: pInicio, fim: pFim },
        benchmark_conta: benchmarkConta,
        anuncios: paraAvaliar.map((r) => {
          const attr = atributosPorAdId.get(r.ad_id);
          const custoPorParOrcado =
            r.pares_orcamentos > 0
              ? Math.round((r.spend_total / r.pares_orcamentos) * 100) / 100
              : null;
          const irmaos = (r.adset_id ? anunciosPorAdsetId.get(r.adset_id) : undefined)
            ?.filter((s) => s.ad_id !== r.ad_id)
            .map((s) => ({
              ad_name: s.ad_name,
              ja_pausado: pausadoAdIds.has(s.ad_id),
              custo_por_lead: s.custo_por_lead,
              custo_por_negociacao: s.custo_por_negociacao,
              roas: s.roas,
              vendas: s.vendas,
            })) ?? [];
          const diarioMap = investimentoDiarioPorAdId.get(r.ad_id);
          const investimentoDiario = todasDatas.map((data) => ({
            data,
            investimento: Math.round((diarioMap?.get(data) ?? 0) * 100) / 100,
          }));
          const funilSemanal = funilSemanalPorAdId.get(r.ad_id) ?? [];
          const cpcImplicito = r.cliques > 0 ? Math.round((r.spend_total / r.cliques) * 100) / 100 : null;
          const cpmImplicito = r.impressoes > 0 ? Math.round((r.spend_total / r.impressoes) * 1000 * 100) / 100 : null;
          return {
            ad_id: r.ad_id,
            ad_name: r.ad_name,
            campaign_name: r.campaign_name,
            categoria_objetivo: classificarObjetivo(attr),
            investimento: r.spend_total,
            impressoes: r.impressoes,
            cliques: r.cliques,
            cpc_implicito: cpcImplicito,
            cpm_implicito: cpmImplicito,
            leads: r.leads_ghl,
            orcamentos: r.orcamentos,
            valor_orcamentos: r.valor_orcamentos,
            pares_orcamentos: r.pares_orcamentos,
            mockups: r.mockups,
            negociacoes: r.negociacoes,
            vendas: r.vendas,
            faturamento: r.faturamento,
            custo_por_lead: r.custo_por_lead,
            custo_por_orcamento: r.custo_por_orcamento,
            custo_por_par_orcado: custoPorParOrcado,
            custo_por_mockup: r.custo_por_mockup,
            custo_por_negociacao: r.custo_por_negociacao,
            cpa_venda: r.cpa_venda,
            roas: r.roas,
            diagnostico_atual: r.diagnostico,
            irmaos_no_mesmo_conjunto: irmaos,
            investimento_diario: investimentoDiario,
            funil_semanal: funilSemanal,
          };
        }),
      };

      const respostaTexto = await callClaude(
        apiKey,
        CONTEXTO_NEGOCIO,
        JSON.stringify(contexto, null, 2),
        16000,
      );
      // deno-lint-ignore no-explicit-any
      const json = extractJson(respostaTexto) as any;
      const itens = Array.isArray(json.itens) ? json.itens : [];

      const porAdId = new Map(paraAvaliar.map((r) => [r.ad_id, r]));
      linhasAvaliadas = itens
        // deno-lint-ignore no-explicit-any
        .filter((it: any) => porAdId.has(it.ad_id) && VEREDITOS_VALIDOS.has(it.veredito))
        // deno-lint-ignore no-explicit-any
        .map((it: any) => {
          const r = porAdId.get(it.ad_id)!;
          return {
            ad_id: it.ad_id,
            ad_name: r.ad_name,
            campaign_name: r.campaign_name,
            veredito: it.veredito,
            justificativa: String(it.justificativa ?? "").slice(0, 1000),
            periodo_inicio: pInicio,
            periodo_fim: pFim,
            gerado_por: MODELO,
            gerado_em: new Date().toISOString(),
          };
        });
    }

    const linhas = [...linhasPausadas, ...linhasAvaliadas];

    if (linhas.length > 0) {
      const { error: upErr } = await supabase
        .from("meta_ghl_ad_insights")
        .upsert(linhas, { onConflict: "ad_id" });
      if (upErr) throw new Error(`Upsert meta_ghl_ad_insights: ${upErr.message}`);
      rows = linhas.length;
    }

    await logSync(supabase, "meta_ghl_insights", startedAt, rows, "success");
    return new Response(JSON.stringify({ rows }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    errMsg = err instanceof Error ? err.message : String(err);
    await logSync(supabase, "meta_ghl_insights", startedAt, rows, "error", errMsg);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
