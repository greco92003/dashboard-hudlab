// Supabase Edge Function: meta-ghl-creative-insights
// Task #29 do brainstorm de Insights: cruza os atributos de criativo já
// extraídos (meta_ad_creative_analysis -- visão/Whisper, CACHE caro por
// creative_id, não reprocessado aqui) com métricas de performance
// frescas (get_funnel_por_anuncio) pra achar padrões sistematicamente --
// motivado pelo caso real "Seu Logo Aqui" (achado só depois de ~1 ano de
// tentativa e erro manual, sem nenhuma ferramenta ajudando).
//
// Diferente de meta-ghl-creative-analysis (visão + Whisper, caro), essa
// function só manda TEXTO (o JSON de análise já pronto + métrica de
// funil) pro Claude -- barato, pode rodar toda vez que quiser sem
// reprocessar imagem/áudio de nenhum criativo.
//
// Secrets necessários: ANTHROPIC_API_KEY (mesma da conta, ver memória
// sobre saldo compartilhado entre meta-ghl-insights/ig-inteligencia/
// meta-ghl-creative-analysis/este).
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODELO = "claude-sonnet-5";
const JANELA_DIAS = 30;

interface FunnelRow {
  ad_id: string;
  ad_name: string | null;
  campaign_name: string | null;
  spend_total: number;
  impressoes: number;
  cliques: number;
  leads_ghl: number;
  orcamentos: number;
  mockups: number;
  negociacoes: number;
  vendas: number;
  custo_por_lead: number | null;
  custo_por_orcamento: number | null;
  custo_por_negociacao: number | null;
  roas: number | null;
}

interface AdAttributesRow {
  ad_id: string;
  effective_status: string | null;
  campaign_objective: string | null;
  adset_optimization_goal: string | null;
  adset_destination_type: string | null;
}

interface CreativeAnalysisRow {
  ad_id: string;
  media_type: string | null;
  call_to_action_type: string | null;
  analysis: Record<string, unknown> | null;
  transcript: string | null;
}

// Mesma classificação de meta-ghl-insights (duplicada de propósito --
// cada edge function nesse projeto é auto-contida, sem lib compartilhada).
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

const STATUS_PAUSADO = new Set(["PAUSED", "ADSET_PAUSED", "CAMPAIGN_PAUSED"]);

const CONTEXTO_NEGOCIO = `Você é um analista de criativos de tráfego pago sênior, especialista
em achar padrões do que funciona em anúncios pra Hud Lab, private
label de chinelos slide personalizados (cliente manda o logo, a Hud
Lab produz e entrega com a marca do cliente). Público típico: empresas
presenteando clientes/funcionários, times esportivos, igrejas/grupos,
revendedores.

Contexto real que motiva essa tarefa: a equipe já descobriu por conta
própria, depois de ~1 ANO de tentativa e erro manual sem nenhuma
ferramenta ajudando, que criativos com o texto "SEU LOGO AQUI"
sobreposto no produto performam consistentemente melhor. Sua tarefa é
achar esse tipo de padrão de forma sistemática, olhando os atributos
estruturados de cada criativo (já extraídos por visão computacional +
transcrição de áudio) cruzados com a performance real de funil de cada
anúncio.

Você recebe uma lista de anúncios ATIVOS, cada um com:
- Atributos de criativo (formato de mídia, estilo visual, tom da copy,
  público-alvo sugerido pela peça, se tem texto sobreposto e qual,
  se mostra preço, se menciona pedido mínimo/prazo de entrega, se o
  produto aparece em close-up, se tem modelo vestindo o produto, CTA
  configurado no Meta, resumo da peça, transcrição de áudio se vídeo).
- Métricas de performance dos últimos ${JANELA_DIAS} dias (investimento,
  impressões, cliques, leads, orçamentos, mockups, negociações, vendas,
  custo por lead/orçamento/negociação, ROAS).
- "categoria_objetivo": pra que o Meta está OTIMIZANDO cada anúncio --
  crucial pra não comparar coisas diferentes:
  - "lead_direto": otimizado pra geração de lead/conversão -- compare
    livremente por custo_por_lead/orcamento/negociacao e ROAS entre
    esses anúncios.
  - "trafego_perfil"/"trafego_link"/"engajamento": NÃO são otimizados
    pra lead, então NUNCA compare esses contra "lead_direto" pelas
    mesmas métricas de funil (leads baixos/zero é esperado e normal
    pra eles). Se achar padrão relevante dentro dessas categorias, use
    a métrica certa (custo de alcance/clique/CPM implícito), nunca
    custo_por_lead.

Regras rígidas pra cada padrão que você reportar:
1. Baseie-se SÓ em atributos de CRIATIVO (formato, estilo visual, tom,
   público sugerido, presença/conteúdo de texto sobreposto, CTA,
   elementos visuais como modelo vestindo produto ou close-up) -- NÃO
   sugira mudança de verba/segmentação/orçamento, isso já é coberto por
   outra ferramenta (Insights). Seu foco é "que TIPO de criativo
   performa melhor", não "que anúncio pausar".
2. SEMPRE cite números REAIS do payload na descrição (nome do anúncio +
   métrica exata, ex.: "GHL - Estático Jornal de Negócios: R$186,81 de
   custo por negociação vs. R$502,49 do GrecoClassico") -- nunca uma
   afirmação vaga tipo "criativos institucionais performam bem" sem o
   número de comparação.
3. Classifique "forca_sinal" com honestidade sobre o tamanho da
   amostra: "forte" exige pelo menos 3 anúncios com investimento
   combinado relevante (>= R$1.500) mostrando a mesma direção; "fraco"
   é qualquer padrão baseado em 1 anúncio isolado ou investimento baixo
   (< R$300) -- não infle a confiança, isso é mais útil sendo honesto
   sobre incerteza do que parecendo mais certo do que é.
4. Liste em "anuncios_relacionados" os ad_id/ad_name que sustentam
   CADA padrão -- quem for ler precisa conseguir conferir.
5. Não repita o óbvio ("anúncios com mais investimento geram mais
   leads") -- foque em padrões ACIONÁVEIS sobre O CRIATIVO em si:
   formato específico (ex.: "jornal falso"/depoimento/meme/vídeo
   pessoa falando), presença de frase específica no texto, tom de
   copy, público sugerido, etc.
6. Se não houver dado suficiente pra nenhum padrão confiável ainda
   (poucos anúncios com investimento relevante), diga isso claramente
   em vez de forçar um padrão -- pode retornar uma lista vazia ou só
   com "forca_sinal":"fraco".

Responda APENAS com um objeto JSON válido, sem cerca de markdown, sem
texto antes/depois, exatamente neste formato:
{"padroes": [{"titulo": "...", "descricao": "...", "metrica_chave": "...", "forca_sinal": "forte"|"moderado"|"fraco", "anuncios_relacionados": [{"ad_id": "...", "ad_name": "..."}]}]}`;

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

    const { data: funilData, error: funilError } = await supabase.rpc("get_funnel_por_anuncio", {
      p_inicio: pInicio,
      p_fim: pFim,
    });
    if (funilError) throw new Error(`get_funnel_por_anuncio: ${funilError.message}`);
    const funilPorAdId = new Map(
      ((funilData ?? []) as FunnelRow[]).map((r) => [r.ad_id, r]),
    );

    const { data: attrData, error: attrError } = await supabase
      .from("meta_ad_attributes")
      .select("ad_id, effective_status, campaign_objective, adset_optimization_goal, adset_destination_type");
    if (attrError) throw new Error(`meta_ad_attributes: ${attrError.message}`);
    const atributosPorAdId = new Map(
      ((attrData ?? []) as AdAttributesRow[]).map((a) => [a.ad_id, a]),
    );

    const { data: creativeData, error: creativeError } = await supabase
      .from("meta_ad_creative_analysis")
      .select("ad_id, media_type, call_to_action_type, analysis, transcript")
      .not("analysis", "is", null);
    if (creativeError) throw new Error(`meta_ad_creative_analysis: ${creativeError.message}`);
    const criativos = (creativeData ?? []) as CreativeAnalysisRow[];

    // Só entram anúncios ATIVOS com criativo já analisado -- padrão
    // pausado/deletado não é útil pra decidir o que fazer daqui pra
    // frente (mesma régua de meta-ghl-insights).
    const anuncios = criativos
      .filter((c) => !STATUS_PAUSADO.has(atributosPorAdId.get(c.ad_id)?.effective_status ?? ""))
      .map((c) => {
        const funil = funilPorAdId.get(c.ad_id);
        const attr = atributosPorAdId.get(c.ad_id);
        const cpcImplicito = funil && funil.cliques > 0 ? Math.round((funil.spend_total / funil.cliques) * 100) / 100 : null;
        const cpmImplicito = funil && funil.impressoes > 0 ? Math.round((funil.spend_total / funil.impressoes) * 1000 * 100) / 100 : null;
        return {
          ad_id: c.ad_id,
          ad_name: funil?.ad_name ?? null,
          categoria_objetivo: classificarObjetivo(attr),
          media_type: c.media_type,
          call_to_action_type: c.call_to_action_type,
          criativo: c.analysis,
          transcricao_audio: c.transcript,
          investimento: funil?.spend_total ?? 0,
          cpc_implicito: cpcImplicito,
          cpm_implicito: cpmImplicito,
          leads: funil?.leads_ghl ?? 0,
          orcamentos: funil?.orcamentos ?? 0,
          mockups: funil?.mockups ?? 0,
          negociacoes: funil?.negociacoes ?? 0,
          vendas: funil?.vendas ?? 0,
          custo_por_lead: funil?.custo_por_lead ?? null,
          custo_por_orcamento: funil?.custo_por_orcamento ?? null,
          custo_por_negociacao: funil?.custo_por_negociacao ?? null,
          roas: funil?.roas ?? null,
        };
      })
      // Sem nenhum dado de funil (ad_name null = fora de
      // get_funnel_por_anuncio) não ajuda a achar padrão de
      // performance -- fica de fora dessa análise (continua no resto
      // do dashboard normalmente).
      .filter((a) => a.ad_name != null);

    if (anuncios.length === 0) {
      await logSync(supabase, "meta_creative_insights", startedAt, 0, "success", "nenhum anúncio elegível (sem criativo analisado + funil)");
      return new Response(JSON.stringify({ rows: 0, mensagem: "nenhum anúncio elegível" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const respostaTexto = await callClaude(
      apiKey,
      CONTEXTO_NEGOCIO,
      JSON.stringify({ periodo: { inicio: pInicio, fim: pFim }, anuncios }, null, 2),
      16000,
    );
    // deno-lint-ignore no-explicit-any
    const json = extractJson(respostaTexto) as any;
    const padroes = Array.isArray(json.padroes) ? json.padroes : [];

    // Mapa auxiliar pra reanexar métricas REAIS (não a versão que o
    // Claude reescreveu em prosa) em cada anúncio citado -- achado ao
    // testar: mesmo instruído a citar número real do payload, o Claude
    // erra a transcrição de alguns valores ao escrever a descrição
    // (ex.: custo_por_negociacao real R$186,81 virou "R$158,26" na
    // prosa de um dos padrões). A descrição continua como narrativa,
    // mas o número exibido no frontend vem daqui, não da prosa --
    // fonte da verdade é sempre o dado, nunca o texto gerado.
    const metricasPorAdId = new Map(anuncios.map((a) => [a.ad_id, a]));

    const FORCAS_VALIDAS = new Set(["forte", "moderado", "fraco"]);
    const linhas = padroes
      // deno-lint-ignore no-explicit-any
      .filter((p: any) => p.titulo && p.descricao)
      // deno-lint-ignore no-explicit-any
      .map((p: any) => {
        const relacionadosBrutos = Array.isArray(p.anuncios_relacionados) ? p.anuncios_relacionados : [];
        const relacionadosVerificados = relacionadosBrutos
          // deno-lint-ignore no-explicit-any
          .filter((r: any) => r?.ad_id && metricasPorAdId.has(r.ad_id))
          // deno-lint-ignore no-explicit-any
          .map((r: any) => {
            const real = metricasPorAdId.get(r.ad_id)!;
            return {
              ad_id: real.ad_id,
              ad_name: real.ad_name,
              investimento: real.investimento,
              custo_por_lead: real.custo_por_lead,
              custo_por_negociacao: real.custo_por_negociacao,
              roas: real.roas,
              cpc_implicito: real.cpc_implicito,
              cpm_implicito: real.cpm_implicito,
            };
          });
        return {
          titulo: String(p.titulo).slice(0, 300),
          descricao: String(p.descricao).slice(0, 2000),
          metrica_chave: p.metrica_chave ? String(p.metrica_chave).slice(0, 100) : null,
          forca_sinal: FORCAS_VALIDAS.has(p.forca_sinal) ? p.forca_sinal : "fraco",
          anuncios_relacionados: relacionadosVerificados,
          periodo_inicio: pInicio,
          periodo_fim: pFim,
          gerado_por: MODELO,
          gerado_em: new Date().toISOString(),
        };
      });

    // Substitui o conteúdo anterior por completo -- é sempre "o
    // retrato mais atual", sem histórico acumulado (mesmo padrão de
    // meta_ghl_ad_insights).
    const { error: delErr } = await supabase
      .from("meta_ad_creative_insights")
      .delete()
      .not("id", "is", null);
    if (delErr) throw new Error(`Delete meta_ad_creative_insights: ${delErr.message}`);

    if (linhas.length > 0) {
      const { error: insErr } = await supabase.from("meta_ad_creative_insights").insert(linhas);
      if (insErr) throw new Error(`Insert meta_ad_creative_insights: ${insErr.message}`);
      rows = linhas.length;
    }

    await logSync(supabase, "meta_creative_insights", startedAt, rows, "success");
    return new Response(JSON.stringify({ rows, anuncios_avaliados: anuncios.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    errMsg = err instanceof Error ? err.message : String(err);
    await logSync(supabase, "meta_creative_insights", startedAt, rows, "error", errMsg);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
