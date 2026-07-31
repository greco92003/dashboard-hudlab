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

// Anúncios de campanha de tráfego com destino "visita ao perfil do
// Instagram" (BIO) não geram lead direto atribuível a esse ad_id --
// avaliados de forma diferente no prompt (ver CONTEXTO_NEGOCIO).
function ehTrafegoPerfil(attr: AdAttributesRow | undefined): boolean {
  if (!attr) return false;
  return (
    attr.adset_destination_type === "INSTAGRAM_PROFILE" ||
    (attr.campaign_objective === "OUTCOME_TRAFFIC" &&
      attr.adset_optimization_goal === "PROFILE_VISIT")
  );
}

const CONTEXTO_NEGOCIO = `Você é um analista de performance de tráfego pago pra Hud Lab, empresa
de Chinelo Slide personalizado (venda B2B/em lote pra marcas, empresas,
times e eventos -- não é venda unitária pro consumidor final).

Regras de negócio importantes pra avaliar os anúncios corretamente:
- CAC/CPA é sempre medido POR PEDIDO fechado, nunca por par individual
  (um pedido tem dezenas de pares).
- PRIORIZE eficiência de custo POR ETAPA do funil (custo_por_lead,
  custo_por_orcamento, custo_por_par_orcado, custo_por_negociacao) como
  critério PRINCIPAL de avaliação -- é o sinal mais maduro e confiável
  que temos hoje. Trate ROAS e vendas como sinal SECUNDÁRIO, ainda em
  maturação: o ciclo de venda é longo (~35 dias do lead até o
  fechamento), então um pico recente de leads/orçamentos/mockups ainda
  não teve tempo de virar negociação ou venda. Não julgue "PAUSAR" nem
  penalize um anúncio só por ROAS baixo ou vendas=0 se as etapas
  anteriores do funil estão custando bem e em volume saudável -- isso é
  maturação do funil, não anúncio ruim. Com mais janelas de dados no
  futuro o ROAS/vendas ganha mais peso; por enquanto avalie por partes,
  etapa por etapa.
- ROAS >= 2x é considerado bom pro negócio quando já há maturidade
  suficiente de dado (funil rodando há tempo, sem pico recente de
  topo). Abaixo disso, olhe o resto do funil antes de decidir.
- Anúncios com "trafego_perfil": true pertencem a campanhas com
  objetivo de tráfego/visita ao perfil do Instagram (BIO), não geração
  de lead direta -- o próprio Meta os otimiza pra isso, não pra
  conversão. NÃO avalie esses pelo número de leads/orçamentos
  atribuídos diretamente a esse ad_id: quem entra pela bio e depois
  vira lead orgânico não fica atribuído a esse anúncio específico no
  nosso rastreamento (é uma limitação de atribuição conhecida, não um
  sinal de mau desempenho). Avalie esses pelo custo de alcance/cliques
  (o investimento total e o CPM implícito) como canal de topo de
  funil/marca, e considere "MANTER" mesmo com leads/orçamentos diretos
  baixos ou zero, contanto que o custo não esteja desproporcional.
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
  orçamento, par orçado, negociação) e/ou ROAS alto já com dado maduro,
  vale aumentar verba.
- "MANTER": custo por etapa ok/consistente, ou anúncio de
  tráfego/perfil com custo de alcance razoável -- não há motivo pra
  mudar agora.
- "REVISAR": sinal misto ou dado insuficiente pra decidir com
  confiança -- precisa de atenção humana, mas não é claramente ruim.
- "PAUSAR": custo por etapa do funil comprovadamente ruim (gasto
  relevante, funil não avança em nenhuma etapa, sem sinal de
  maturação), vale cortar.

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
          return {
            ad_id: r.ad_id,
            ad_name: r.ad_name,
            campaign_name: r.campaign_name,
            investimento: r.spend_total,
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
            trafego_perfil: ehTrafegoPerfil(attr),
            irmaos_no_mesmo_conjunto: irmaos,
          };
        }),
      };

      const respostaTexto = await callClaude(
        apiKey,
        CONTEXTO_NEGOCIO,
        JSON.stringify(contexto, null, 2),
        8000,
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
