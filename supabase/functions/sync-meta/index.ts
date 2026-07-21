// Supabase Edge Function: sync-meta
// Sincroniza métricas diárias do Meta Ads (level=ad, breakdown=region)
// para a tabela meta_insights_daily. Idempotente (upsert por date+ad_id+region).
//
// Body opcional: {"since":"YYYY-MM-DD","until":"YYYY-MM-DD"} para backfill.
// Padrão: últimos 3 dias (captura ajustes retroativos de atribuição do Meta).
//
// Secrets necessários:
//   META_ACCESS_TOKEN  - System User token com ads_read
//   META_AD_ACCOUNT_ID - "act_XXXX" (opcional se META_BUSINESS_ID estiver setado)
//   META_BUSINESS_ID   - fallback: resolve a primeira conta de anúncios do BM
//   SYNC_SECRET        - opcional; se setado, exige header x-sync-secret
import { createClient } from "jsr:@supabase/supabase-js@2";

const GRAPH = "https://graph.facebook.com/v23.0";

interface InsightRow {
  date_start: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  region?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  inline_link_clicks?: string;
  cpm?: string;
  cpc?: string;
  actions?: { action_type: string; value: string }[];
}

// Extrai leads do array actions. O Meta pode reportar "lead" (agregado) e/ou
// "onsite_conversion.lead_grouped". Preferimos "lead"; se ausente, usamos o
// grouped — nunca somamos os dois para não contar em dobro.
function extractLeads(actions?: { action_type: string; value: string }[]): number {
  if (!actions) return 0;
  const find = (t: string) => actions.find((a) => a.action_type === t);
  const lead = find("lead") ?? find("onsite_conversion.lead_grouped");
  return lead ? Number(lead.value) || 0 : 0;
}

async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  let attempt = 0;
  while (true) {
    const res = await fetch(url);
    if (res.status !== 400 && res.ok) return res;
    const body = await res.clone().json().catch(() => null);
    const code = body?.error?.code;
    // code 17 = rate limit; backoff exponencial
    if (code === 17 && attempt < maxRetries) {
      attempt++;
      await new Promise((r) => setTimeout(r, 2 ** attempt * 5000));
      continue;
    }
    return res;
  }
}

async function resolveAdAccountId(token: string): Promise<string> {
  const explicit = Deno.env.get("META_AD_ACCOUNT_ID");
  if (explicit) return explicit.startsWith("act_") ? explicit : `act_${explicit}`;
  const businessId = Deno.env.get("META_BUSINESS_ID");
  if (!businessId) throw new Error("Defina META_AD_ACCOUNT_ID ou META_BUSINESS_ID");
  const res = await fetchWithRetry(
    `${GRAPH}/${businessId}/owned_ad_accounts?fields=id,name&access_token=${token}`,
  );
  if (!res.ok) throw new Error(`Erro ao resolver ad account: ${await res.text()}`);
  const data = await res.json();
  const id = data?.data?.[0]?.id;
  if (!id) throw new Error("Nenhuma conta de anúncios encontrada no Business Manager");
  return id;
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

  const log = async (status: string, rows: number, error?: string) => {
    await supabase.from("sync_log").insert({
      source: "meta",
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      rows_upserted: rows,
      status,
      error: error ?? null,
    });
  };

  try {
    const token = Deno.env.get("META_ACCESS_TOKEN");
    if (!token) throw new Error("META_ACCESS_TOKEN não configurado");
    const accountId = await resolveAdAccountId(token);

    // Período: body {since, until} ou últimos 3 dias
    let since: string | undefined, until: string | undefined;
    try {
      const body = await req.json();
      since = body.since;
      until = body.until;
    } catch {
      /* sem body */
    }
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    until ||= fmt(today);
    if (!since) {
      const d = new Date(today);
      d.setDate(d.getDate() - 3);
      since = fmt(d);
    }

    const fields = [
      "campaign_id", "campaign_name", "adset_id", "adset_name",
      "ad_id", "ad_name", "spend", "impressions", "clicks",
      "inline_link_clicks", "cpm", "cpc", "actions",
    ].join(",");

    let url: string | null =
      `${GRAPH}/${accountId}/insights?level=ad&breakdowns=region` +
      `&fields=${fields}&time_increment=1&limit=500` +
      `&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}` +
      `&access_token=${token}`;

    let totalRows = 0;
    while (url) {
      const res = await fetchWithRetry(url);
      if (!res.ok) throw new Error(`Meta API ${res.status}: ${await res.text()}`);
      const page = await res.json();
      const rows = (page.data as InsightRow[] | undefined) ?? [];

      const mapped = rows
        .filter((r) => r.ad_id && r.date_start)
        .map((r) => {
          const leads = extractLeads(r.actions);
          const spend = Number(r.spend) || 0;
          return {
            date: r.date_start,
            account_id: accountId,
            campaign_id: r.campaign_id ?? null,
            campaign_name: r.campaign_name ?? null,
            adset_id: r.adset_id ?? null,
            adset_name: r.adset_name ?? null,
            ad_id: r.ad_id!,
            ad_name: r.ad_name ?? null,
            region: r.region ?? "Unknown",
            spend,
            impressions: Number(r.impressions) || 0,
            clicks: Number(r.clicks) || 0,
            link_clicks: Number(r.inline_link_clicks) || 0,
            leads,
            cpm: r.cpm != null ? Number(r.cpm) : null,
            cpc: r.cpc != null ? Number(r.cpc) : null,
            cpl: leads > 0 ? spend / leads : null,
            synced_at: new Date().toISOString(),
          };
        });

      if (mapped.length > 0) {
        const { error } = await supabase
          .from("meta_insights_daily")
          .upsert(mapped, { onConflict: "date,ad_id,region" });
        if (error) throw new Error(`Upsert: ${error.message}`);
        totalRows += mapped.length;
      }

      url = page.paging?.next ?? null;
    }

    await log("success", totalRows);
    return new Response(
      JSON.stringify({
        rows: totalRows,
        date_range: { since, until },
        duration_ms: Date.now() - startedAt.getTime(),
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await log("error", 0, msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
