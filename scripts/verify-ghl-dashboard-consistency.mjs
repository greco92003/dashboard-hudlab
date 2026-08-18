import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { collectGhlCursorSnapshot } from "../lib/ghl/cursor-pagination.ts";

dotenv.config({ path: ".env.local", quiet: true });

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "DASHBOARD_SECRET",
  "GHL_PRIVATE_INTEGRATION_TOKEN",
  "GHL_LOCATION_ID",
];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is not configured`);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.DASHBOARD_SECRET,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function fetchAllSupabase(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += 1_000) {
    const { data, error } = await buildQuery(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < 1_000) return rows;
  }
}

async function fetchWonPage(cursor) {
  const base = (process.env.GHL_API_BASE_URL || "https://services.leadconnectorhq.com").replace(/\/$/, "");
  const url = new URL(`${base}/opportunities/search`);
  url.searchParams.set("location_id", process.env.GHL_LOCATION_ID);
  url.searchParams.set("limit", "100");
  url.searchParams.set("status", "won");
  if (cursor) {
    url.searchParams.set("startAfter", cursor.startAfter);
    url.searchParams.set("startAfterId", cursor.startAfterId);
  } else {
    url.searchParams.set("page", "1");
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.GHL_PRIVATE_INTEGRATION_TOKEN}`,
      Version: process.env.GHL_API_VERSION || "2021-07-28",
      Accept: "application/json",
    },
  });
  if (!response.ok) throw new Error(`GHL verification failed with HTTP ${response.status}`);
  const body = await response.json();
  return {
    items: body.opportunities || [],
    total: body.meta?.total ?? -1,
    nextPageUrl: body.meta?.nextPageUrl ?? null,
  };
}

const [ghlSnapshot, cachedWon, recentOpportunities] = await Promise.all([
  collectGhlCursorSnapshot({ fetchPage: fetchWonPage }),
  fetchAllSupabase((from, to) =>
    supabase
      .from("deals_cache")
      .select("deal_id,value,status,closing_date,last_synced_at")
      .eq("source_system", "ghl")
      .eq("sync_status", "synced")
      .eq("status", "won")
      .range(from, to),
  ),
  fetchAllSupabase((from, to) =>
    supabase
      .from("ghl_opportunities")
      .select("id,monetary_value,won_at")
      .eq("status", "won")
      .gte("won_at", "2026-08-04T03:00:00.000Z")
      .range(from, to),
  ),
]);

const ghlById = new Map(ghlSnapshot.items.map((row) => [row.id, row]));
const cacheById = new Map(cachedWon.map((row) => [row.deal_id, row]));
const missingFromCache = ghlSnapshot.items.filter((row) => !cacheById.has(row.id));
const staleWonCache = cachedWon.filter((row) => !ghlById.has(row.deal_id));
const missingRecent = recentOpportunities.filter((row) => !cacheById.has(row.id));
const recentOutsideDashboardPeriod = recentOpportunities
  .map((row) => ({ source: row, cache: cacheById.get(row.id) }))
  .filter(({ cache }) => {
    const day = cache?.closing_date?.slice(0, 10);
    return !day || day < "2026-08-04" || day > "2026-08-31";
  })
  .map(({ source, cache }) => ({
    id: source.id,
    wonAt: source.won_at,
    closingDate: cache?.closing_date ?? null,
  }));
const money = (value) => Number(value || 0);

const report = {
  generatedAt: new Date().toISOString(),
  ghlWon: {
    count: ghlSnapshot.expectedTotal,
    valueBrl: Math.round(ghlSnapshot.items.reduce((sum, row) => sum + money(row.monetaryValue), 0) * 100) / 100,
    pages: ghlSnapshot.pages,
    duplicates: ghlSnapshot.duplicates,
    complete: ghlSnapshot.complete,
  },
  cacheWon: {
    count: cachedWon.length,
    valueBrl: Math.round(cachedWon.reduce((sum, row) => sum + money(row.value) / 100, 0) * 100) / 100,
  },
  sinceAugust4: {
    sourceWon: recentOpportunities.length,
    missingFromCache: missingRecent.map((row) => row.id),
    outsideDashboardPeriod: recentOutsideDashboardPeriod,
  },
  differences: {
    missingFromCache: missingFromCache.map((row) => row.id),
    staleWonCache: staleWonCache.map((row) => row.deal_id),
  },
};

console.log(JSON.stringify(report, null, 2));
if (
  missingFromCache.length ||
  staleWonCache.length ||
  missingRecent.length ||
  recentOutsideDashboardPeriod.length
) {
  process.exitCode = 1;
}
