import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/security/route-guards";
import {
  getGhlDeals,
  filterDealsByClosingDate,
} from "@/lib/ghl/api";
import {
  calculateBrazilDateRange,
  formatBrazilDateToLocal,
} from "@/lib/utils/timezone";

// GHL equivalent of /api/deals-cache: serves opportunities from GoHighLevel
// mapped to the same flat Deal shape, filtered by closing date. Used by the
// provisional /dashboard-ghl page during the ActiveCampaign -> GHL migration.

export async function GET(request: NextRequest) {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;

  try {
    const { searchParams } = new URL(request.url);
    const period = parseInt(searchParams.get("period") || "30");
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    const refresh = searchParams.get("refresh") === "1";
    // Debug/validation aid: include deals without closing_date (open deals)
    const includeOpen = searchParams.get("includeOpen") === "1";

    let startDateStr: string;
    let endDateStr: string;

    if (startDateParam && endDateParam) {
      startDateStr = startDateParam;
      endDateStr = endDateParam;
    } else {
      const brazilDateRange = calculateBrazilDateRange(period);
      startDateStr = formatBrazilDateToLocal(brazilDateRange.startDate);
      endDateStr = formatBrazilDateToLocal(brazilDateRange.endDate);
    }

    const { deals, fetchedAt, totalOpportunities } = await getGhlDeals(refresh);

    const filteredDeals = (
      includeOpen
        ? deals
        : filterDealsByClosingDate(deals, startDateStr, endDateStr)
    ).sort((a, b) =>
      (b.closing_date || "") < (a.closing_date || "") ? -1 : 1,
    );

    return NextResponse.json(
      {
        deals: filteredDeals,
        totalDeals: filteredDeals.length,
        period: startDateParam && endDateParam ? null : period,
        customDateRange:
          startDateParam && endDateParam
            ? { startDate: startDateParam, endDate: endDateParam }
            : null,
        lastSync: fetchedAt,
        syncStatus: "live",
        totalDealsInLastSync: totalOpportunities,
        cacheInfo: {
          source: "gohighlevel_api",
          fetchedAt,
          periodDays: startDateParam && endDateParam ? null : period,
          dateRange: {
            startDate: startDateStr,
            endDate: endDateStr,
          },
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Data-Source": "gohighlevel",
        },
      },
    );
  } catch (error) {
    console.error("Error in GHL deals API:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export const maxDuration = 60;
