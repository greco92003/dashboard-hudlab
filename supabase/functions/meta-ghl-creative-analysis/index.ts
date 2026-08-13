// Supabase Edge Function: meta-ghl-creative-analysis
//
// Brainstorm do Insights (2026-08-13, item "visão de criativo"):
// motivado pelo caso real "Seu Logo Aqui" -- um padrão de criativo que
// performava melhor e só foi descoberto por tentativa e erro em ~1 ano,
// sem nenhuma ferramenta ajudando a achar isso. Esta function fecha
// esse loop: analisa a IMAGEM/VÍDEO + copy de cada anúncio ativo via
// Claude (visão) e Whisper (transcrição de áudio de vídeo), extraindo
// atributos estruturados e comparáveis entre anúncios.
//
// Separada do sync-meta (que só grava o metadado bruto de criativo)
// porque essa etapa custa chamada de LLM/Whisper -- só roda pra
// creative_id que ainda não foi analisado (analyzed_creative_id !=
// creative_id), não a cada sync diário.
//
// Fluxo por anúncio:
//   video: resolve token de PÁGINA (system user sozinho não pode
//     baixar o arquivo-fonte do vídeo, confirmado 2026-08-13) ->
//     GET /{video_id}?fields=source,length -> baixa o mp4 -> manda
//     direto pro Whisper (aceita mp4) -> transcrição em texto.
//   imagem: usa image_url (ou thumbnail_url de vídeo) direto.
//   Claude: recebe a imagem/thumbnail (base64) + transcrição (se
//     vídeo) + copy (body/title/cta) -> devolve atributos estruturados
//     em JSON fixo, comparável entre anúncios.
//
// Secrets necessários:
//   ANTHROPIC_API_KEY  - já usado pelo meta-ghl-insights
//   OPENAI_API_KEY     - Whisper (transcrição de vídeo)
//   META_ACCESS_TOKEN, META_BUSINESS_ID / META_AD_ACCOUNT_ID - já usados pelo sync-meta
//   SYNC_SECRET        - opcional; se setado, exige header x-sync-secret
import { createClient } from "jsr:@supabase/supabase-js@2";

const GRAPH = "https://graph.facebook.com/v23.0";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODELO = "claude-sonnet-5";
const TIME_BUDGET_MS = 45_000;
const MAX_HOPS = 10;

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

interface CreativeRow {
  ad_id: string;
  creative_id: string;
  media_type: "image" | "video";
  body: string | null;
  title: string | null;
  call_to_action_type: string | null;
  image_url: string | null;
  video_id: string | null;
  thumbnail_url: string | null;
}

const ESQUEMA_ANALISE = `{
  "tem_texto_no_criativo": boolean,
  "texto_principal": string | null,
  "produto_em_close_up": boolean,
  "modelo_vestindo_produto": boolean,
  "mostra_preco": boolean,
  "estilo_visual": "foto de produto" | "lifestyle" | "depoimento/prova social" | "renderizacao 3d/mockup" | "outro",
  "menciona_pedido_minimo": boolean,
  "menciona_prazo_entrega": boolean,
  "tom_da_copy": "urgencia/promocao" | "institucional" | "prova social" | "convite direto" | "humor/casual" | "outro",
  "publico_alvo_sugerido": "empresas/corporativo" | "times esportivos" | "igrejas/grupos religiosos" | "revendedores/private label" | "geral/nao especifico" | "outro",
  "resumo": string
}`;

const SYSTEM_PROMPT = `Você é um analista de criativos de tráfego pago especialista na Hud Lab, uma private label de chinelos slide personalizados (cliente manda o logo, a Hud Lab produz e entrega o chinelo com a marca do cliente). Público típico: empresas presenteando clientes/funcionários, times esportivos, igrejas/grupos, revendedores.

Você recebe a peça de um anúncio do Meta Ads (imagem, ou o frame/thumbnail de um vídeo) e o contexto textual (copy, título, CTA, transcrição de áudio se for vídeo). Sua tarefa é extrair atributos ESTRUTURADOS e OBJETIVOS do criativo, pra permitir comparar dezenas de anúncios entre si e achar padrões do que funciona melhor.

Responda APENAS com um objeto JSON válido, sem markdown, sem texto antes/depois, seguindo exatamente este formato:
${ESQUEMA_ANALISE}

Seja literal e objetivo -- "texto_principal" deve ser a transcrição exata de qualquer texto grande/destacado que aparece NA IMAGEM (não a legenda do post), ou null se não houver nenhum texto sobreposto na peça.`;

// deno-lint-ignore no-explicit-any
async function fetchWithRetry(url: string, init?: RequestInit, maxRetries = 3): Promise<Response> {
  let attempt = 0;
  while (true) {
    const res = await fetch(url, init);
    if (res.status !== 429 || attempt >= maxRetries) return res;
    attempt++;
    await new Promise((r) => setTimeout(r, 2 ** attempt * 2000));
  }
}

// Vídeo-fonte (mp4 baixável) só é exposto com um token de PÁGINA, não
// com o token de system user puro -- confirmado ao vivo 2026-08-13
// (mesmos escopos, resposta sem o campo "source" até trocar o token).
async function resolvePageToken(businessToken: string): Promise<string | null> {
  const businessId = Deno.env.get("META_BUSINESS_ID");
  if (!businessId) return null;
  const res = await fetchWithRetry(
    `${GRAPH}/${businessId}/owned_pages?fields=id,name,access_token&access_token=${businessToken}`,
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data?.data?.[0]?.access_token ?? null;
}

async function transcreverVideo(
  videoId: string,
  pageToken: string,
  openaiKey: string,
): Promise<{ transcript: string | null; lengthSeconds: number | null }> {
  const res = await fetchWithRetry(
    `${GRAPH}/${videoId}?fields=source,length&access_token=${pageToken}`,
  );
  if (!res.ok) return { transcript: null, lengthSeconds: null };
  const data = await res.json();
  const source = data?.source as string | undefined;
  const length = data?.length != null ? Number(data.length) : null;
  if (!source) return { transcript: null, lengthSeconds: length };

  const videoRes = await fetch(source);
  if (!videoRes.ok) return { transcript: null, lengthSeconds: length };
  const blob = await videoRes.blob();

  const form = new FormData();
  form.append("file", blob, "ad.mp4");
  form.append("model", "whisper-1");
  const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}` },
    body: form,
  });
  if (!whisperRes.ok) {
    return { transcript: `[falha na transcrição: ${whisperRes.status}]`, lengthSeconds: length };
  }
  const whisperData = await whisperRes.json();
  return { transcript: whisperData.text ?? null, lengthSeconds: length };
}

async function baixarImagemBase64(url: string): Promise<{ mediaType: string; data: string } | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const mediaType = contentType.split(";")[0].trim();
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return { mediaType, data: btoa(binary) };
}

function extractJson(text: string): unknown {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\n?/, "").replace(/```\s*$/, "").trim();
  }
  return JSON.parse(t);
}

async function analisarCriativo(
  apiKey: string,
  image: { mediaType: string; data: string },
  row: CreativeRow,
  transcript: string | null,
): Promise<unknown> {
  const contexto = [
    row.title ? `Título: ${row.title}` : null,
    row.body ? `Copy: ${row.body}` : null,
    row.call_to_action_type ? `CTA: ${row.call_to_action_type}` : null,
    row.media_type === "video"
      ? `Transcrição do áudio do vídeo: ${transcript ?? "(sem áudio detectável ou falha na transcrição)"}`
      : null,
  ].filter(Boolean).join("\n\n");

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            // deno-lint-ignore no-explicit-any
            source: { type: "base64", media_type: image.mediaType as any, data: image.data },
          },
          { type: "text", text: contexto || "(sem copy/título/CTA disponível)" },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  // deno-lint-ignore no-explicit-any
  const textBlock = (data.content ?? []).find((b: any) => b.type === "text");
  if (!textBlock) throw new Error("Resposta do Claude sem bloco de texto");
  return extractJson(textBlock.text as string);
}

function chainNext(hop: number) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/meta-ghl-creative-analysis`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const secret = Deno.env.get("SYNC_SECRET");
  if (secret) headers["x-sync-secret"] = secret;
  EdgeRuntime.waitUntil(
    fetch(url, { method: "POST", headers, body: JSON.stringify({ hop }) }).catch(
      (e) => console.error("chainNext falhou:", e),
    ),
  );
}

Deno.serve(async (req: Request) => {
  const syncSecret = Deno.env.get("SYNC_SECRET");
  if (syncSecret && req.headers.get("x-sync-secret") !== syncSecret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  let hop = 0;
  let limit: number | null = null;
  try {
    const body = await req.json();
    hop = body?.hop ?? 0;
    limit = body?.limit ?? null;
  } catch {
    /* sem body */
  }
  if (hop >= MAX_HOPS) {
    return new Response(JSON.stringify({ error: "max hops excedido" }), { status: 500 });
  }

  const startedAt = new Date();
  const deadline = Date.now() + TIME_BUDGET_MS;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  const metaToken = Deno.env.get("META_ACCESS_TOKEN");
  if (!anthropicKey) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY não configurado" }),
      { status: 500 },
    );
  }
  // openaiKey/metaToken só são necessários pra vídeo (transcrição) --
  // anúncio de imagem funciona só com o Claude. Sem eles, vídeo é
  // analisado sem transcrição (registrado como erro por linha, não
  // derruba a function inteira).

  let analisados = 0;
  const erros: { ad_id: string; erro: string }[] = [];
  let pageTokenCache: string | null | undefined;

  try {
    const { data, error } = await supabase
      .from("meta_ad_creative_analysis")
      .select("ad_id, creative_id, media_type, body, title, call_to_action_type, image_url, video_id, thumbnail_url")
      .not("creative_id", "is", null)
      .or("analyzed_creative_id.is.null,analyzed_creative_id.neq.creative_id");
    if (error) throw new Error(`Consulta de pendentes: ${error.message}`);
    const todosPendentes = (data ?? []) as CreativeRow[];
    // limit: uso manual (teste em 1-2 anúncios antes de rodar em todos).
    // Com limit setado, não encadeia mesmo se sobrar pendente -- é um
    // corte explícito, não um limite de orçamento de tempo.
    const pendentes = limit != null ? todosPendentes.slice(0, limit) : todosPendentes;

    for (const row of pendentes) {
      if (Date.now() >= deadline) break;
      try {
        let transcript: string | null = null;
        let lengthSeconds: number | null = null;
        let imageUrlParaAnalise = row.image_url ?? row.thumbnail_url;

        if (row.media_type === "video" && row.video_id) {
          if (pageTokenCache === undefined) {
            pageTokenCache = metaToken ? await resolvePageToken(metaToken) : null;
          }
          if (pageTokenCache && openaiKey) {
            const r = await transcreverVideo(row.video_id, pageTokenCache, openaiKey);
            transcript = r.transcript;
            lengthSeconds = r.lengthSeconds;
          } else if (!openaiKey) {
            transcript = "[transcrição pendente: OPENAI_API_KEY não configurado]";
          }
          imageUrlParaAnalise = row.thumbnail_url ?? row.image_url;
        }

        if (!imageUrlParaAnalise) {
          throw new Error("Sem image_url/thumbnail_url disponível");
        }
        const image = await baixarImagemBase64(imageUrlParaAnalise);
        if (!image) throw new Error(`Falha ao baixar imagem/thumbnail: ${imageUrlParaAnalise}`);

        const analysis = await analisarCriativo(anthropicKey, image, row, transcript);

        const { error: upErr } = await supabase
          .from("meta_ad_creative_analysis")
          .update({
            transcript,
            video_length_seconds: lengthSeconds,
            analysis,
            analyzed_at: new Date().toISOString(),
            analyzed_creative_id: row.creative_id,
          })
          .eq("ad_id", row.ad_id);
        if (upErr) throw new Error(`Update: ${upErr.message}`);
        analisados++;
      } catch (err) {
        erros.push({ ad_id: row.ad_id, erro: err instanceof Error ? err.message : String(err) });
      }
    }

    const restantes = todosPendentes.length - analisados - erros.length;
    const continua = limit == null && restantes > 0 && Date.now() >= deadline;
    if (continua) chainNext(hop + 1);

    await supabase.from("sync_log").insert({
      source: "meta_creative_analysis",
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      rows_upserted: analisados,
      status: erros.length > 0 ? "error" : "success",
      error: erros.length > 0
        ? `${erros.length} erro(s): ${erros.slice(0, 5).map((e) => `${e.ad_id} (${e.erro})`).join("; ")}`
        : null,
    });

    return new Response(
      JSON.stringify({ analisados, pendentes: pendentes.length, total_pendentes: todosPendentes.length, erros, continua, hop }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from("sync_log").insert({
      source: "meta_creative_analysis",
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      rows_upserted: analisados,
      status: "error",
      error: msg,
    });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
