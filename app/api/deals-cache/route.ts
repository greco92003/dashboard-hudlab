import { getSupabaseSecretKey } from "@/lib/supabase/keys-server";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase/server";
import { requireAdmin, requireApprovedUser } from "@/lib/security/route-guards";
import {
  calculateBrazilDateRange,
  formatBrazilDateToLocal,
  logTimezoneDebug,
} from "@/lib/utils/timezone";
import { normalizeGhlDealStatus } from "@/lib/ghl/pipelines";
import { fetchAllSupabaseRows } from "@/lib/supabase-pagination";

// Helper function to format date as local YYYY-MM-DD without timezone conversion
const formatDateToLocal = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// STATIC-FIRST API: Serve cached deals data
// Updated by cron job, served like static content

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey(),
);

// STATIC-FIRST GET: Serve cached deals like static content
export async function GET(request: NextRequest) {
  try {
    const access = await requireApprovedUser();
    if (!access.ok) return access.response;

    const { searchParams } = new URL(request.url);
    const period = parseInt(searchParams.get("period") || "30");
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    const statusParam = searchParams.get("status")?.toLowerCase() || null;

    let startDate: Date;
    let endDate: Date;

    if (startDateParam && endDateParam) {
      // Use custom date range - Parse as local dates to avoid timezone issues
      // Create dates using UTC to avoid timezone conversion problems
      const [startYear, startMonth, startDay] = startDateParam
        .split("-")
        .map(Number);
      const [endYear, endMonth, endDay] = endDateParam.split("-").map(Number);

      // Use UTC dates to avoid timezone conversion issues
      startDate = new Date(
        Date.UTC(startYear, startMonth - 1, startDay, 0, 0, 0, 0),
      );
      endDate = new Date(
        Date.UTC(endYear, endMonth - 1, endDay, 23, 59, 59, 999),
      );

      console.log("API: Custom date range received:", {
        startDateParam,
        endDateParam,
        parsedStartDate: startDate,
        parsedEndDate: endDate,
        formattedStart: formatDateToLocal(startDate),
        formattedEnd: formatDateToLocal(endDate),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    } else {
      // Calculate date range in Brazilian timezone - Month-based logic (same day of previous months)
      logTimezoneDebug("deals-cache API");
      const brazilDateRange = calculateBrazilDateRange(period);
      startDate = brazilDateRange.startDate;
      endDate = brazilDateRange.endDate;

      console.log(
        "API: Period-based date range calculated in Brazil timezone:",
        {
          period,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          formattedStart: formatBrazilDateToLocal(startDate),
          formattedEnd: formatBrazilDateToLocal(endDate),
        },
      );
    }

    // Fetch deals from cache (updated by cron) - include all custom fields
    const deals = await fetchAllSupabaseRows<any>(
      (from, to) =>
        supabase
          .from("deals_cache")
          .select(
            `
        id, deal_id, title, value, currency, status, stage_id,
        pipeline_id, stage_title, source_system, source_id,
        closing_date, created_date, custom_field_value, custom_field_id,
        estado, "quantidade-de-pares", vendedor, designer,
        "utm-source", "utm-medium", custom_field_54, data_embarque,
        contact_id, organization_id, api_updated_at, last_synced_at,
        segmento_de_negocio, intencao_de_compra
      `,
          )
          .eq("source_system", "ghl")
          .eq("sync_status", "synced")
          .not("closing_date", "is", null)
          .gte(
            "closing_date",
            startDateParam || formatBrazilDateToLocal(startDate),
          )
          .lte("closing_date", endDateParam || formatBrazilDateToLocal(endDate))
          .order("closing_date", { ascending: false })
          .order("deal_id", { ascending: true })
          .range(from, to),
      "GHL deals cache read failed",
    );

    // Keep every dashboard aligned with the GHL business rule. Moving an
    // already completed sale to the Mockup Factory resets its provider status
    // to `open`, so normalize it again at read time as a safety net for rows
    // created before the cache migration/backfill ran.
    const normalizedDeals = deals.map((deal) => ({
      ...deal,
      status: normalizeGhlDealStatus(
        deal.pipeline_id,
        deal.stage_id,
        deal.status,
        deal.value,
      ),
    }));
    const transformedDeals = statusParam
      ? normalizedDeals.filter(
          (deal) => deal.status?.toLowerCase() === statusParam,
        )
      : normalizedDeals;

    const { data: lastSync, count: totalCachedDeals } = await supabase
      .from("deals_cache")
      .select("last_synced_at", { count: "exact" })
      .eq("source_system", "ghl")
      .eq("sync_status", "synced")
      .order("last_synced_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json(
      {
        deals: transformedDeals,
        totalDeals: transformedDeals.length,
        period: startDateParam && endDateParam ? null : period,
        customDateRange:
          startDateParam && endDateParam
            ? { startDate: startDateParam, endDate: endDateParam }
            : null,
        status: statusParam,
        lastSync: lastSync?.last_synced_at || null,
        syncStatus: lastSync ? "synced" : "unknown",
        totalDealsInLastSync: totalCachedDeals || 0,
        cacheInfo: {
          source: "ghl_deals_cache",
          fetchedAt: new Date().toISOString(),
          periodDays: startDateParam && endDateParam ? null : period,
          dateRange: {
            startDate: formatBrazilDateToLocal(startDate),
            endDate: formatBrazilDateToLocal(endDate),
          },
        },
      },
      {
        headers: {
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
          "X-Data-Source": "ghl-deals-cache",
        },
      },
    );
  } catch (error) {
    console.error("Error in deals-cache API:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// POST endpoint to manually trigger sync
export async function POST() {
  try {
    const access = await requireAdmin();
    if (!access.ok) return access.response;

    console.log("Manual sync trigger requested");

    // Check if there's already a sync running
    const supabase = await createSupabaseServer();
    const { data: runningSyncs } = await supabase
      .from("deals_sync_log")
      .select("id, sync_status")
      .eq("sync_status", "running")
      .limit(1);

    if (runningSyncs && runningSyncs.length > 0) {
      return NextResponse.json(
        {
          error:
            "Uma sincronização já está em andamento. Aguarde a finalização para iniciar outra.",
          isRunning: true,
        },
        { status: 409 }, // Conflict status
      );
    }

    // Trigger sync
    const syncResponse = await fetch(
      `${
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
      }/api/ghl/sync-deals`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.CRON_SECRET}`,
        },
      },
    );

    if (!syncResponse.ok) {
      const errorText = await syncResponse.text();
      throw new Error(`Sync failed: ${errorText}`);
    }

    const syncResult = await syncResponse.json();

    return NextResponse.json({
      message: "Sync triggered successfully",
      syncResult,
    });
  } catch (error) {
    console.error("Error triggering manual sync:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// Set timeout for this API route
export const maxDuration = 300;
