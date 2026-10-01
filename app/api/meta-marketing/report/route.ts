import { createClient } from "@supabase/supabase-js";
import { after, NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/security/route-guards";
import { getSupabaseSecretKey } from "@/lib/supabase/keys-server";
import { summarizeTopCampaigns } from "@/app/meta-marketing/top-campaigns";

export const maxDuration = 60;

const REPORTS = {
  summary: "get_resumo_periodo",
  series: "get_serie_diaria",
  funnel: "get_funil_etapas",
  sources: "get_desempenho_fonte",
  ads: "get_funnel_por_anuncio",
  "top-campaigns": "get_funnel_por_anuncio",
} as const;
type Report = keyof typeof REPORTS;
type ServiceClient = ReturnType<typeof serviceClient>;

const SYNC_SOURCES = [
  "meta", "ghl_snapshots", "ghl_opportunities", "ghl_contacts",
  "ghl_deals_cache_full", "ghl_deals_cache_won",
];
const HEADERS = { "Cache-Control": "private, no-store" };

function validDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function serviceClient() {
  return createClient<any>(process.env.NEXT_PUBLIC_SUPABASE_URL!, getSupabaseSecretKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function responseData(report: Report, payload: unknown) {
  return report === "top-campaigns" ? summarizeTopCampaigns(payload) : payload;
}

function ttlMs(fim: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  if (fim >= today) return 30 * 60_000;
  const recent = new Date(`${today}T00:00:00Z`);
  recent.setUTCDate(recent.getUTCDate() - 28);
  return fim >= recent.toISOString().slice(0, 10) ? 2 * 60 * 60_000 : 24 * 60 * 60_000;
}

async function refresh(
  supabase: ServiceClient, cacheKey: string, rpcName: string, inicio: string, fim: string,
) {
  const { data, error } = await supabase.rpc(rpcName, { p_inicio: inicio, p_fim: fim });
  if (error) throw new Error(`${rpcName}: ${error.message}`);
  const refreshedAt = new Date();
  const { error: saveError } = await supabase.from("meta_marketing_report_cache")
    .update({
      payload: data,
      refreshed_at: refreshedAt.toISOString(),
      expires_at: new Date(refreshedAt.getTime() + ttlMs(fim)).toISOString(),
      claim_started_at: null,
    })
    .eq("cache_key", cacheKey);
  if (saveError) throw new Error(`Cache ${rpcName}: ${saveError.message}`);
  return { data, updatedAt: refreshedAt.toISOString() };
}

export async function GET(request: NextRequest) {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;

  const params = request.nextUrl.searchParams;
  const report = params.get("report") as Report;
  const inicio = params.get("inicio");
  const fim = params.get("fim");
  if (!Object.prototype.hasOwnProperty.call(REPORTS, report) || !validDate(inicio) || !validDate(fim) ||
      inicio > fim || Date.parse(fim) - Date.parse(inicio) > 366 * 86_400_000) {
    return NextResponse.json({ error: "Relatório ou período inválido" }, { status: 400, headers: HEADERS });
  }

  const rpcName = REPORTS[report];
  // All current SQL reports cover every account in this Supabase project.
  // Keep scope and calculation version in the key to prevent later cross-account reuse.
  const cacheKey = `marketing:v1:project-all-accounts:America-Sao_Paulo:${rpcName}:${inicio}:${fim}`;
  const supabase = serviceClient();
  const [{ data: cached, error: cacheError }, { data: latestSync, error: syncError }] = await Promise.all([
    supabase.from("meta_marketing_report_cache")
      .select("payload,refreshed_at,expires_at,claim_started_at")
      .eq("cache_key", cacheKey).maybeSingle(),
    supabase.from("sync_log").select("finished_at")
      .in("source", SYNC_SOURCES).eq("status", "success")
      .gt("rows_upserted", 0).order("finished_at", { ascending: false })
      .limit(1).maybeSingle(),
  ]);
  if (cacheError || syncError) {
    console.error("Marketing report cache lookup failed", cacheError ?? syncError);
    return NextResponse.json({ error: "Não foi possível ler o relatório" }, { status: 502, headers: HEADERS });
  }

  const hasPayload = cached?.payload != null;
  const fresh = hasPayload && cached?.refreshed_at && cached?.expires_at &&
    Date.parse(cached.expires_at) > Date.now() &&
    (!latestSync?.finished_at || Date.parse(cached.refreshed_at) >= Date.parse(latestSync.finished_at));
  if (fresh) {
    return NextResponse.json({ data: responseData(report, cached.payload), updatedAt: cached.refreshed_at, stale: false }, { headers: HEADERS });
  }

  const { data: claimed, error: claimError } = await supabase.rpc("try_claim_meta_marketing_report", {
    p_cache_key: cacheKey, p_report_name: rpcName, p_inicio: inicio, p_fim: fim,
  });
  if (claimError) {
    console.error("Marketing report cache claim failed", claimError);
    if (!hasPayload) return NextResponse.json({ error: "Relatório indisponível" }, { status: 502, headers: HEADERS });
  }

  if (hasPayload) {
    if (claimed) {
      after(async () => {
        try { await refresh(serviceClient(), cacheKey, rpcName, inicio, fim); }
        catch (error) { console.error("Marketing report background refresh failed", error); }
      });
    }
    return NextResponse.json({ data: responseData(report, cached.payload), updatedAt: cached.refreshed_at, stale: true }, { headers: HEADERS });
  }
  if (!claimed) return NextResponse.json({ pending: true }, { status: 202, headers: HEADERS });

  try {
    const result = await refresh(supabase, cacheKey, rpcName, inicio, fim);
    return NextResponse.json({ data: responseData(report, result.data), updatedAt: result.updatedAt, stale: false }, { headers: HEADERS });
  } catch (error) {
    console.error("Marketing report refresh failed", error);
    return NextResponse.json({ error: "Não foi possível atualizar o relatório" }, { status: 502, headers: HEADERS });
  }
}
