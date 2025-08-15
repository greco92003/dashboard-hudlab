import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  calculateBrazilDateRange,
  formatBrazilDateToLocal,
  logTimezoneDebug,
} from "@/lib/utils/timezone";

// Helper function to format date as local YYYY-MM-DD without timezone conversion
const formatDateToLocal = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// API to get total pairs sold from deals cache
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

      console.log("Pairs API: Custom date range received:", {
        startDateParam,
        endDateParam,
        parsedStartDate: startDate,
        parsedEndDate: endDate,
        formattedStart: formatDateToLocal(startDate),
        formattedEnd: formatDateToLocal(endDate),
      });
    } else {
      // Calculate date range in Brazilian timezone - Month-based logic (same day of previous months)
      logTimezoneDebug("pairs-sold-total API");
      const brazilDateRange = calculateBrazilDateRange(period);
      startDate = brazilDateRange.startDate;
      endDate = brazilDateRange.endDate;

      console.log(
        "Pairs API: Period-based date range calculated in Brazil timezone:",
        {
          period,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          formattedStart: formatBrazilDateToLocal(startDate),
          formattedEnd: formatBrazilDateToLocal(endDate),
        }
      );
    }

    // Fetch deals from cache and sum quantidade-de-pares field
    const { data: deals, error } = await supabase
      .from("deals_cache")
      .select('"quantidade-de-pares"')
      .eq("sync_status", "synced")
      .not("closing_date", "is", null)
      .gte("closing_date", startDateParam || formatBrazilDateToLocal(startDate))
      .lte("closing_date", endDateParam || formatBrazilDateToLocal(endDate));

    if (error) {
      console.error("Error fetching deals from cache:", error);
      return NextResponse.json(
        { error: "Failed to fetch deals from cache" },
        { status: 500 }
      );
    }

    // Calculate total pairs sold from quantidade-de-pares field
    const totalPairsSold =
      deals?.reduce((sum: number, deal) => {
        const quantidadePares = parseInt(deal["quantidade-de-pares"] || "0");
        return sum + quantidadePares;
      }, 0) || 0;

    // Calculate pairs sold per day based on the period
    let divisor = 22; // default for 30 days
    if (period === 60) {
      divisor = 44;
    } else if (period === 90) {
      divisor = 66;
    }

    const pairsSoldPerDay = Math.round(totalPairsSold / divisor);

    return NextResponse.json(
      {
        totalPairsSold,
        pairsSoldPerDay,
        period: startDateParam && endDateParam ? null : period,
        customDateRange:
          startDateParam && endDateParam
            ? { startDate: startDateParam, endDate: endDateParam }
            : null,
        dateRange: {
          start: formatBrazilDateToLocal(startDate),
          end: formatBrazilDateToLocal(endDate),
        },
        totalDealsAnalyzed: deals?.length || 0,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=300", // Cache for 5 minutes
        },
      }
    );
  } catch (error) {
    console.error("Error in pairs-sold-total API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
