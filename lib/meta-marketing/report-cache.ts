import { createClient } from "@supabase/supabase-js";
import { getSupabaseSecretKey } from "@/lib/supabase/keys-server";
import { summarizeTopCampaigns } from "@/app/meta-marketing/top-campaigns";
import type { MarketingReport, ParsedReportRequest } from "@/app/meta-marketing/report-catalog";

export type ParsedOk = Extract<ParsedReportRequest, { ok: true }>;
export interface ReportResult { data: unknown; updatedAt: string | null; stale: boolean }

type ServiceClient = ReturnType<typeof serviceClient>;

const SYNC_SOURCES = [
  "meta", "ghl_snapshots", "ghl_opportunities", "ghl_contacts",
  "ghl_deals_cache_full", "ghl_deals_cache_won",
];

function serviceClient() {
  return createClient<any>(process.env.NEXT_PUBLIC_SUPABASE_URL!, getSupabaseSecretKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function responseData(report: MarketingReport, payload: unknown) {
  return report === "top-campaigns" ? summarizeTopCampaigns(payload) : payload;
}

function todaySaoPaulo() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function ttlMs(fim: string) {
  const today = todaySaoPaulo();
  if (fim >= today) return 30 * 60_000;
  const recent = new Date(`${today}T00:00:00Z`);
  recent.setUTCDate(recent.getUTCDate() - 28);
  return fim >= recent.toISOString().slice(0, 10) ? 2 * 60 * 60_000 : 24 * 60 * 60_000;
}

async function refresh(
  supabase: ServiceClient, cacheKey: string, rpcName: string,
  args: { p_inicio: string; p_fim: string } | undefined, ttlUntil: string,
) {
  const { data, error } = await supabase.rpc(rpcName, args);
  if (error) throw new Error(`${rpcName}: ${error.message}`);
  const refreshedAt = new Date();
  const { error: saveError } = await supabase.from("meta_marketing_report_cache")
    .update({
      payload: data,
      refreshed_at: refreshedAt.toISOString(),
      expires_at: new Date(refreshedAt.getTime() + ttlMs(ttlUntil)).toISOString(),
      claim_started_at: null,
    })
    .eq("cache_key", cacheKey);
  if (saveError) throw new Error(`Cache ${rpcName}: ${saveError.message}`);
  return { data, updatedAt: refreshedAt.toISOString() };
}

function describe(req: ParsedOk) {
  // Relatório sem período é um retrato do momento: chave fixa e o dia de
  // hoje como período, o que dá a validade curta (30 min) do ttlMs.
  const today = todaySaoPaulo();
  const inicio = req.inicio ?? today;
  const fim = req.fim ?? today;
  const args = req.inicio && req.fim ? { p_inicio: req.inicio, p_fim: req.fim } : undefined;
  const periodKey = args ? `${inicio}:${fim}` : "all";
  // All current SQL reports cover every account in this Supabase project.
  // Keep scope and calculation version in the key to prevent later cross-account reuse.
  const cacheKey = `marketing:v1:project-all-accounts:America-Sao_Paulo:${req.rpc}:${periodKey}`;
  return { inicio, fim, args, cacheKey };
}

async function lookup(supabase: ServiceClient, cacheKey: string) {
  const [{ data: cached, error: cacheError }, { data: latestSync, error: syncError }] = await Promise.all([
    supabase.from("meta_marketing_report_cache")
      .select("payload,refreshed_at,expires_at,claim_started_at")
      .eq("cache_key", cacheKey).maybeSingle(),
    supabase.from("sync_log").select("finished_at")
      .in("source", SYNC_SOURCES).eq("status", "success")
      .gt("rows_upserted", 0).order("finished_at", { ascending: false })
      .limit(1).maybeSingle(),
  ]);
  const hasPayload = cached?.payload != null;
  const fresh = !!(hasPayload && cached?.refreshed_at && cached?.expires_at &&
    Date.parse(cached.expires_at) > Date.now() &&
    (!latestSync?.finished_at || Date.parse(cached.refreshed_at) >= Date.parse(latestSync.finished_at)));
  return { cached, hasPayload, fresh, error: cacheError ?? syncError };
}

/** O que a rota faz hoje: cache fresco → devolve; vencido → devolve e atualiza em segundo plano; sem cache → calcula. */
export async function serveReport(req: ParsedOk, background: (task: () => Promise<void>) => void):
  Promise<{ status: 200; body: ReportResult } | { status: 202; body: { pending: true } } | { status: 502; body: { error: string } }> {
  const { report, rpc: rpcName } = req;
  const { inicio, fim, args, cacheKey } = describe(req);
  const supabase = serviceClient();
  const { cached, hasPayload, fresh, error } = await lookup(supabase, cacheKey);
  if (error) {
    console.error("Marketing report cache lookup failed", error);
    return { status: 502, body: { error: "Não foi possível ler o relatório" } };
  }
  if (fresh) {
    return { status: 200, body: { data: responseData(report, cached!.payload), updatedAt: cached!.refreshed_at, stale: false } };
  }

  const { data: claimed, error: claimError } = await supabase.rpc("try_claim_meta_marketing_report", {
    p_cache_key: cacheKey, p_report_name: rpcName, p_inicio: inicio, p_fim: fim,
  });
  if (claimError) {
    console.error("Marketing report cache claim failed", claimError);
    if (!hasPayload) return { status: 502, body: { error: "Relatório indisponível" } };
  }

  if (hasPayload) {
    if (claimed) {
      background(async () => {
        try { await refresh(serviceClient(), cacheKey, rpcName, args, fim); }
        catch (e) { console.error("Marketing report background refresh failed", e); }
      });
    }
    return { status: 200, body: { data: responseData(report, cached!.payload), updatedAt: cached!.refreshed_at, stale: true } };
  }
  if (!claimed) return { status: 202, body: { pending: true } };

  try {
    const result = await refresh(supabase, cacheKey, rpcName, args, fim);
    return { status: 200, body: { data: responseData(report, result.data), updatedAt: result.updatedAt, stale: false } };
  } catch (e) {
    console.error("Marketing report refresh failed", e);
    return { status: 502, body: { error: "Não foi possível atualizar o relatório" } };
  }
}

/** Pré-aquecimento: recalcula se não estiver fresco, esperando terminar. */
export async function warmReport(req: ParsedOk): Promise<"fresh" | "refreshed" | "busy" | "error"> {
  const { inicio, fim, args, cacheKey } = describe(req);
  const supabase = serviceClient();
  try {
    const { fresh, error } = await lookup(supabase, cacheKey);
    if (error) throw new Error(error.message);
    if (fresh) return "fresh";
    const { data: claimed, error: claimError } = await supabase.rpc("try_claim_meta_marketing_report", {
      p_cache_key: cacheKey, p_report_name: req.rpc, p_inicio: inicio, p_fim: fim,
    });
    if (claimError) throw new Error(claimError.message);
    if (!claimed) return "busy";
    await refresh(supabase, cacheKey, req.rpc, args, fim);
    return "refreshed";
  } catch (e) {
    console.error("Marketing report prewarm failed", req.report, e);
    return "error";
  }
}
