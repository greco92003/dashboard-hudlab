import { NextRequest, NextResponse } from "next/server";
import {
  getGhlDeals,
  filterDealsByClosingDate,
} from "@/lib/ghl/api";
import {
  calculateBrazilDateRange,
  formatBrazilDateToLocal,
} from "@/lib/utils/timezone";

// GHL equivalent of /api/pairs-sold-total: sums "Quantidade de Pares" from
// won GoHighLevel opportunities within the closing date range.

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = parseInt(searchParams.get("period") || "30");
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    const refresh = searchParams.get("refresh") === "1";

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

    const { deals } = await getGhlDeals(refresh);

    const wonDealsInRange = filterDealsByClosingDate(
      deals,
      startDateStr,
      endDateStr,
    ).filter((deal) => deal.status === "won");

    const totalPairsSold = wonDealsInRange.reduce((sum, deal) => {
      const pairs = parseInt(String(deal["quantidade-de-pares"] || "0"));
      return sum + (isNaN(pairs) ? 0 : pairs);
    }, 0);

    // Same business-days divisor used by /api/pairs-sold-total
    let divisor = 22;
    if (period === 60) divisor = 44;
    else if (period === 90) divisor = 66;

    return NextResponse.json(
      {
        totalPairsSold,
        pairsSoldPerDay: Math.round(totalPairsSold / divisor),
        period: startDateParam && endDateParam ? null : period,
        customDateRange:
          startDateParam && endDateParam
            ? { startDate: startDateParam, endDate: endDateParam }
            : null,
        dateRange: {
          start: startDateStr,
          end: endDateStr,
        },
        totalDealsAnalyzed: wonDealsInRange.length,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Data-Source": "gohighlevel",
        },
      },
    );
  } catch (error) {
    console.error("Error in GHL pairs-sold-total API:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export const maxDuration = 60;
