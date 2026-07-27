// Supabase Edge Function: sync-instagram
// Sincroniza mídia orgânica do Instagram (posts/reels/carrosséis via
// /media, stories ativos via /stories) e seus insights (reach, views,
// saved, shares, likes, comments, watch time de reels) para as tabelas
// ig_media / ig_media_insights_daily. Idempotente (upsert por id /
// date+media_id).
//
// Body opcional {"phase": "media" | "stories"} -- sem phase (ou body
// vazio) roda os dois. Mídia permanente e stories têm cron separados
// (ver instagram_organico_cron.sql / instagram_organico_stories_cron.sql):
// mídia poucas vezes/dia (barato mas não urgente), stories a cada 30min
// (efêmeros, 24h -- rodar com frequência evita perder as últimas horas
// de visualização antes de expirar). Idempotente, repetir é sempre seguro.
//
// Secrets necessários (reaproveitados do módulo Meta Ads, nenhum novo):
//   META_ACCESS_TOKEN  - System User token com instagram_basic + instagram_manage_insights
//   META_BUSINESS_ID   - resolve a Page/conta do Instagram no Business Manager
//   SYNC_SECRET        - opcional; se setado, exige header x-sync-secret
import { createClient } from "jsr:@supabase/supabase-js@2";

const GRAPH = "https://graph.facebook.com/v23.0";

const MEDIA_FIELDS = [
  "id", "caption", "media_type", "media_product_type",
  "timestamp", "permalink", "media_url", "thumbnail_url",
].join(",");
// "views" é universal (feed/carrossel/reels); as duas últimas só existem
// pra reels e simplesmente não aparecem no resultado dos demais tipos
// (testado ao vivo -- sem erro, sem precisar separar a chamada por tipo).
const MEDIA_METRICS = [
  "reach", "views", "saved", "shares", "likes", "comments",
  "total_interactions", "ig_reels_avg_watch_time", "ig_reels_video_view_total_time",
].join(",");
const STORY_FIELDS = ["id", "media_type", "timestamp", "permalink", "media_url", "thumbnail_url"].join(",");
// Lista completa não validada ao vivo (nenhum story ativo durante o
// desenvolvimento) -- se a Graph API rejeitar alguma métrica, cai pro
// fallback reduzido antes de desistir do item.
const STORY_METRICS_FULL = ["reach", "replies", "shares", "navigation", "total_interactions"].join(",");
const STORY_METRICS_FALLBACK = ["reach", "shares", "total_interactions"].join(",");

interface InsightEntry {
  name: string;
  values: { value: number }[];
}
interface MediaNode {
  id: string;
  caption?: string;
  media_type: string;
  media_product_type?: string;
  timestamp: string;
  permalink: string;
  media_url?: string;
  thumbnail_url?: string;
  insights?: { data: InsightEntry[] };
}

function metricValue(insights: MediaNode["insights"], name: string): number | null {
  const v = insights?.data.find((m) => m.name === name)?.values?.[0]?.value;
  return typeof v === "number" ? v : null;
}

async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  let attempt = 0;
  while (true) {
    const res = await fetch(url);
    if (res.ok) return res;
    const body = await res.clone().json().catch(() => null);
    const code = body?.error?.code;
    // 4 = limite da app, 17 = limite do usuário, 32/613 = limite de página/custom -- backoff exponencial
    if ([4, 17, 32, 613].includes(code) && attempt < maxRetries) {
      attempt++;
      await new Promise((r) => setTimeout(r, 2 ** attempt * 5000));
      continue;
    }
    return res;
  }
}

async function resolveIgUserId(token: string): Promise<string> {
  const explicit = Deno.env.get("IG_BUSINESS_ACCOUNT_ID");
  if (explicit) return explicit;
  const businessId = Deno.env.get("META_BUSINESS_ID");
  if (!businessId) throw new Error("Defina IG_BUSINESS_ACCOUNT_ID ou META_BUSINESS_ID");
  const res = await fetchWithRetry(
    `${GRAPH}/${businessId}/owned_pages?fields=instagram_business_account&access_token=${token}`,
  );
  if (!res.ok) throw new Error(`Erro ao resolver Instagram Business Account: ${await res.text()}`);
  const data = await res.json();
  // deno-lint-ignore no-explicit-any
  const igId = (data?.data ?? []).find((p: any) => p.instagram_business_account)
    ?.instagram_business_account?.id;
  if (!igId) throw new Error("Nenhuma conta do Instagram encontrada nas Pages do Business Manager");
  return igId;
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

function mapMediaRow(m: MediaNode, productTypeOverride?: string) {
  return {
    id: m.id,
    media_type: m.media_type,
    media_product_type: productTypeOverride ?? m.media_product_type ?? "UNKNOWN",
    caption: m.caption ?? null,
    permalink: m.permalink,
    media_url: m.media_url ?? null,
    thumbnail_url: m.thumbnail_url ?? null,
    timestamp: m.timestamp,
    synced_at: new Date().toISOString(),
  };
}

function mapInsightsRow(m: MediaNode, today: string) {
  const ins = m.insights;
  return {
    date: today,
    media_id: m.id,
    reach: metricValue(ins, "reach"),
    views: metricValue(ins, "views"),
    saved: metricValue(ins, "saved"),
    shares: metricValue(ins, "shares"),
    likes: metricValue(ins, "likes"),
    comments: metricValue(ins, "comments"),
    total_interactions: metricValue(ins, "total_interactions"),
    avg_watch_time_ms: metricValue(ins, "ig_reels_avg_watch_time"),
    total_watch_time_ms: metricValue(ins, "ig_reels_video_view_total_time"),
    navigation: metricValue(ins, "navigation"),
    replies: metricValue(ins, "replies"),
    synced_at: new Date().toISOString(),
  };
}

// deno-lint-ignore no-explicit-any
async function upsertPage(supabase: any, mediaRows: ReturnType<typeof mapMediaRow>[], insightRows: ReturnType<typeof mapInsightsRow>[]) {
  if (mediaRows.length === 0) return;
  const { error: mediaErr } = await supabase.from("ig_media").upsert(mediaRows, { onConflict: "id" });
  if (mediaErr) throw new Error(`Upsert ig_media: ${mediaErr.message}`);
  const { error: insErr } = await supabase
    .from("ig_media_insights_daily")
    .upsert(insightRows, { onConflict: "date,media_id" });
  if (insErr) throw new Error(`Upsert ig_media_insights_daily: ${insErr.message}`);
}

// Fase mídia (posts/reels/carrosséis): pagina /media com insights via
// field-expansion (1 chamada por página já traz metadado + métrica
// juntos). Um item com campo obrigatório ausente é pulado, nunca
// aborta o lote inteiro -- mesmo princípio do sync-ghl.
// deno-lint-ignore no-explicit-any
async function syncMedia(supabase: any, token: string, igUserId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const skipped: string[] = [];
  let rows = 0;
  let url: string | null =
    `${GRAPH}/${igUserId}/media?fields=${MEDIA_FIELDS},insights.metric(${MEDIA_METRICS})` +
    `&limit=100&access_token=${token}`;

  while (url) {
    const res = await fetchWithRetry(url);
    if (!res.ok) throw new Error(`Instagram media ${res.status}: ${await res.text()}`);
    const page = await res.json();
    const items = (page.data as MediaNode[] | undefined) ?? [];

    const mediaRows: ReturnType<typeof mapMediaRow>[] = [];
    const insightRows: ReturnType<typeof mapInsightsRow>[] = [];
    for (const item of items) {
      try {
        if (!item.id || !item.timestamp || !item.permalink) {
          skipped.push(`${item.id ?? "?"} (campos obrigatórios ausentes)`);
          continue;
        }
        mediaRows.push(mapMediaRow(item));
        insightRows.push(mapInsightsRow(item, today));
      } catch (err) {
        skipped.push(`${item.id ?? "?"} (${err instanceof Error ? err.message : String(err)})`);
      }
    }
    await upsertPage(supabase, mediaRows, insightRows);
    rows += mediaRows.length;
    url = page.paging?.next ?? null;
  }
  return { rows, skipped };
}

// Fase stories: só existe o que estiver ativo agora (expira em 24h,
// não dá pra buscar retroativo). Tenta a lista completa de métricas e
// cai pro fallback reduzido se a Graph API rejeitar alguma.
// deno-lint-ignore no-explicit-any
async function syncStories(supabase: any, token: string, igUserId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const skipped: string[] = [];
  let rows = 0;

  const tryFetch = (metrics: string) =>
    fetchWithRetry(
      `${GRAPH}/${igUserId}/stories?fields=${STORY_FIELDS},insights.metric(${metrics})&access_token=${token}`,
    );

  let res = await tryFetch(STORY_METRICS_FULL);
  if (!res.ok) res = await tryFetch(STORY_METRICS_FALLBACK);
  if (!res.ok) throw new Error(`Instagram stories ${res.status}: ${await res.text()}`);
  const page = await res.json();
  const items = (page.data as MediaNode[] | undefined) ?? [];

  const mediaRows: ReturnType<typeof mapMediaRow>[] = [];
  const insightRows: ReturnType<typeof mapInsightsRow>[] = [];
  for (const item of items) {
    try {
      if (!item.id || !item.timestamp || !item.permalink) {
        skipped.push(`${item.id ?? "?"} (campos obrigatórios ausentes)`);
        continue;
      }
      mediaRows.push(mapMediaRow(item, "STORY"));
      insightRows.push(mapInsightsRow(item, today));
    } catch (err) {
      skipped.push(`${item.id ?? "?"} (${err instanceof Error ? err.message : String(err)})`);
    }
  }
  await upsertPage(supabase, mediaRows, insightRows);
  rows += mediaRows.length;
  return { rows, skipped };
}

type Phase = "media" | "stories" | "all";

Deno.serve(async (req: Request) => {
  const syncSecret = Deno.env.get("SYNC_SECRET");
  if (syncSecret && req.headers.get("x-sync-secret") !== syncSecret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  let phase: Phase = "all";
  try {
    const body = await req.json();
    if (body?.phase === "media" || body?.phase === "stories") phase = body.phase;
  } catch {
    /* sem body = "all" */
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const token = Deno.env.get("META_ACCESS_TOKEN");
  if (!token) {
    return new Response(JSON.stringify({ error: "META_ACCESS_TOKEN não configurado" }), { status: 500 });
  }

  let igUserId: string;
  try {
    igUserId = await resolveIgUserId(token);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500 },
    );
  }

  let mediaResult: { rows: number; skipped: string[] } | undefined;
  let mediaErr: string | undefined;
  if (phase === "media" || phase === "all") {
    const mediaStartedAt = new Date();
    mediaResult = { rows: 0, skipped: [] };
    try {
      mediaResult = await syncMedia(supabase, token, igUserId);
      if (mediaResult.skipped.length > 0) {
        mediaErr = `${mediaResult.skipped.length} mídia(s) pulada(s): ${mediaResult.skipped.slice(0, 5).join("; ")}`;
      }
    } catch (err) {
      mediaErr = err instanceof Error ? err.message : String(err);
    } finally {
      await logSync(supabase, "instagram_media", mediaStartedAt, mediaResult.rows, mediaErr ? "error" : "success", mediaErr);
    }
  }

  let storiesResult: { rows: number; skipped: string[] } | undefined;
  let storiesErr: string | undefined;
  if (phase === "stories" || phase === "all") {
    const storiesStartedAt = new Date();
    storiesResult = { rows: 0, skipped: [] };
    try {
      storiesResult = await syncStories(supabase, token, igUserId);
      if (storiesResult.skipped.length > 0) {
        storiesErr = `${storiesResult.skipped.length} story(ies) pulado(s): ${storiesResult.skipped.slice(0, 5).join("; ")}`;
      }
    } catch (err) {
      storiesErr = err instanceof Error ? err.message : String(err);
    } finally {
      await logSync(supabase, "instagram_stories", storiesStartedAt, storiesResult.rows, storiesErr ? "error" : "success", storiesErr);
    }
  }

  return new Response(
    JSON.stringify({
      phase,
      media: mediaResult ? { rows: mediaResult.rows, error: mediaErr } : undefined,
      stories: storiesResult ? { rows: storiesResult.rows, error: storiesErr } : undefined,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
