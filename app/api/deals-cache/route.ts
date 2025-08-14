import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// STATIC-FIRST GET: Serve cached deals like static content
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = parseInt(searchParams.get("period") || "30");
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

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
        Date.UTC(startYear, startMonth - 1, startDay, 0, 0, 0, 0)
      );
      endDate = new Date(
        Date.UTC(endYear, endMonth - 1, endDay, 23, 59, 59, 999)
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
      // Calculate date range - Month-based logic (same day of previous months)
      endDate = new Date();
      endDate.setHours(23, 59, 59, 999);

      startDate = new Date();
      let monthsToSubtract = 1;
      if (period === 60) monthsToSubtract = 2;
      else if (period === 90) monthsToSubtract = 3;

      startDate.setMonth(startDate.getMonth() - monthsToSubtract);
      startDate.setHours(0, 0, 0, 0);
    }

    // Fetch deals from cache (updated by cron) - include all custom fields
    const { data: deals, error } = await supabase
      .from("deals_cache")
      .select(
        `
        id, deal_id, title, value, currency, status, stage_id,
        closing_date, created_date, custom_field_value, custom_field_id,
        estado, "quantidade-de-pares", vendedor, designer,
        "utm-source", "utm-medium",
        contact_id, organization_id, api_updated_at, last_synced_at
      `
      )
      .eq("sync_status", "synced")
      .not("closing_date", "is", null)
      .gte("closing_date", startDateParam || formatDateToLocal(startDate))
      .lte("closing_date", endDateParam || formatDateToLocal(endDate))
      .order("closing_date", { ascending: false });

    if (error) {
      console.error("Error fetching deals from cache:", error);
      return NextResponse.json(
        { error: "Failed to fetch deals from cache" },
        { status: 500 }
      );
    }

    // Return deals in the new flat format (no transformation needed)
    const transformedDeals = deals || [];

    // Get last sync info
    const { data: lastSync } = await supabase
      .from("deals_sync_log")
      .select("sync_completed_at, sync_status, deals_processed")
      .order("sync_started_at", { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json(
      {
        deals: transformedDeals,
        totalDeals: transformedDeals.length,
        period: startDateParam && endDateParam ? null : period,
        customDateRange:
          startDateParam && endDateParam
            ? { startDate: startDateParam, endDate: endDateParam }
            : null,
        lastSync: lastSync?.sync_completed_at || null,
        syncStatus: lastSync?.sync_status || "unknown",
        totalDealsInLastSync: lastSync?.deals_processed || 0,
        cacheInfo: {
          source: "static_cache",
          fetchedAt: new Date().toISOString(),
          periodDays: startDateParam && endDateParam ? null : period,
          dateRange: {
            startDate: formatDateToLocal(startDate),
            endDate: formatDateToLocal(endDate),
          },
        },
      },
      {
        headers: {
          "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
          "X-Data-Source": "static-cache",
        },
      }
    );
  } catch (error) {
    console.error("Error in deals-cache API:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// POST endpoint to manually trigger sync
export async function POST() {
  try {
    console.log("Manual sync trigger requested");

    // Trigger sync
    const syncResponse = await fetch(
      `${
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
      }/api/test/robust-deals-sync`,
      {
        method: "GET",
      }
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
      { status: 500 }
    );
  }
}

// Set timeout for this API route
export const config = {
  maxDuration: 30, // 30 seconds
};
