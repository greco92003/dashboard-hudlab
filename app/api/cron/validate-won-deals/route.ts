import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Validates every "won" deal in deals_cache/deals_live against ActiveCampaign
// live data. Deals marked won in the cache but not won in AC get corrected to
// AC's current state; deals deleted from AC get removed. This protects the
// dashboards' revenue numbers from stale rows that the daily full sync and
// the AC webhook can leave behind (e.g. webhook races during bulk edits in
// AC, or deals deleted in AC that the sync never prunes).

const BASE_URL = process.env.NEXT_PUBLIC_AC_BASE_URL;
const API_TOKEN = process.env.AC_API_TOKEN;

function createSupabaseServiceClient() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new Error("Missing Supabase environment variables");
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function acFetch(path: string): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    headers: {
      "Api-Token": API_TOKEN!,
      Accept: "application/json",
    },
    cache: "no-store",
  });
}

/** Fetch the set of deal IDs currently marked won (status=1) in ActiveCampaign. */
async function fetchWonDealIdsFromAC(): Promise<Set<string>> {
  const wonIds = new Set<string>();
  const limit = 100;
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    const res = await acFetch(
      `/api/3/deals?filters%5Bstatus%5D=1&limit=${limit}&offset=${offset}`,
    );
    if (!res.ok) {
      throw new Error(`AC won deals fetch failed: HTTP ${res.status}`);
    }
    const data = await res.json();
    total = parseInt(data.meta?.total || "0");
    for (const deal of data.deals || []) {
      wonIds.add(String(deal.id));
    }
    offset += limit;
  }

  return wonIds;
}

interface SuspectResult {
  deal_id: string;
  action: "deleted" | "corrected" | "still_won" | "error";
  ac_status?: string;
  ac_stage?: string;
  ac_title?: string;
  ac_value?: number;
  cached_title?: string;
  cached_value?: number;
  detail?: string;
}

async function validateWonDeals(dryRun: boolean) {
  if (!BASE_URL || !API_TOKEN) {
    throw new Error("Missing ActiveCampaign environment variables");
  }
  const supabase = createSupabaseServiceClient();

  // 1. Won deals according to AC (source of truth)
  const wonInAC = await fetchWonDealIdsFromAC();

  // 2. Won deals according to deals_cache (paginated: PostgREST caps at 1000 rows)
  const cachedWonDeals: Array<{
    deal_id: string;
    title: string | null;
    value: number | null;
  }> = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("deals_cache")
      .select("deal_id, title, value")
      .in("status", ["won", "1"])
      .order("deal_id")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`deals_cache read failed: ${error.message}`);
    cachedWonDeals.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  // 3. Suspects: won in cache but not won in AC
  const suspects = cachedWonDeals.filter((d) => !wonInAC.has(String(d.deal_id)));

  // 4. Check each suspect individually against AC live
  const results: SuspectResult[] = [];
  const batchSize = 5;
  for (let i = 0; i < suspects.length; i += batchSize) {
    const batch = suspects.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (cached): Promise<SuspectResult> => {
        const dealId = String(cached.deal_id);
        try {
          const res = await acFetch(`/api/3/deals/${dealId}`);

          if (res.status === 404) {
            if (!dryRun) {
              await Promise.all([
                supabase.from("deals_cache").delete().eq("deal_id", dealId),
                supabase.from("deals_live").delete().eq("deal_id", dealId),
              ]);
            }
            return {
              deal_id: dealId,
              action: "deleted",
              cached_title: cached.title ?? undefined,
              cached_value: cached.value ?? undefined,
              detail: "Deal não existe mais no ActiveCampaign",
            };
          }

          if (!res.ok) {
            return {
              deal_id: dealId,
              action: "error",
              detail: `AC HTTP ${res.status}`,
            };
          }

          const acDeal = (await res.json()).deal;
          if (!acDeal) {
            return {
              deal_id: dealId,
              action: "error",
              detail: "Resposta do AC sem deal",
            };
          }

          const patch = {
            title: acDeal.title || "",
            value: parseFloat(acDeal.value || "0"),
            status: acDeal.status || null,
            stage_id: acDeal.stage || null,
            api_updated_at: acDeal.mdate || null,
            last_synced_at: new Date().toISOString(),
          };

          if (!dryRun) {
            await Promise.all([
              supabase.from("deals_cache").update(patch).eq("deal_id", dealId),
              supabase.from("deals_live").update(patch).eq("deal_id", dealId),
            ]);
          }

          return {
            deal_id: dealId,
            action: String(acDeal.status) === "1" ? "still_won" : "corrected",
            ac_status: String(acDeal.status),
            ac_stage: String(acDeal.stage),
            ac_title: acDeal.title,
            ac_value: parseFloat(acDeal.value || "0"),
            cached_title: cached.title ?? undefined,
            cached_value: cached.value ?? undefined,
          };
        } catch (err) {
          return {
            deal_id: dealId,
            action: "error",
            detail: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );
    results.push(...batchResults);

    // Stay under AC's rate limit (5 req/s)
    if (i + batchSize < suspects.length) {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }
  }

  const summary = {
    dryRun,
    wonInAC: wonInAC.size,
    wonInCache: cachedWonDeals.length,
    suspects: suspects.length,
    corrected: results.filter((r) => r.action === "corrected").length,
    deleted: results.filter((r) => r.action === "deleted").length,
    stillWon: results.filter((r) => r.action === "still_won").length,
    errors: results.filter((r) => r.action === "error").length,
    valorCorrigidoCentavos: results
      .filter((r) => r.action === "corrected" || r.action === "deleted")
      .reduce((sum, r) => sum + (r.cached_value || 0), 0),
    results,
    timestamp: new Date().toISOString(),
  };

  console.log(
    `✅ validate-won-deals ${dryRun ? "(DRY RUN) " : ""}` +
      `AC won=${summary.wonInAC} cache won=${summary.wonInCache} ` +
      `suspects=${summary.suspects} corrected=${summary.corrected} ` +
      `deleted=${summary.deleted} stillWon=${summary.stillWon} errors=${summary.errors}`,
  );

  return summary;
}

// Cron endpoint (requires CRON_SECRET, like /api/cron/sync-deals)
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const summary = await validateWonDeals(false);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("validate-won-deals cron error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// Manual trigger (same pattern as /api/cron/sync-deals). Use ?dryRun=1 to
// preview what would be corrected without writing anything.
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dryRun = searchParams.get("dryRun") === "1";

    const summary = await validateWonDeals(dryRun);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("validate-won-deals manual trigger error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export const maxDuration = 300;
