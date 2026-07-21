import { getSupabaseSecretKey } from "@/lib/supabase/keys-server";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireApprovedUser } from "@/lib/security/route-guards";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey(),
);

export async function GET() {
  try {
    const access = await requireApprovedUser();
    if (!access.ok) return access.response;

    // Current month boundaries in UTC-3
    const now = new Date();
    const utcMinus3 = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const year = utcMinus3.getUTCFullYear();
    const month = utcMinus3.getUTCMonth(); // 0-indexed
    const todayDay = utcMinus3.getUTCDate();
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();

    const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(totalDaysInMonth).padStart(2, "0")}`;

    // Fetch won deals (status "1" or "won") with closing_date in current month
    // Source: deals_cache (same as /dashboard) for consistency
    const { data: wonDeals, error: wonError } = await supabase
      .from("deals_cache")
      .select("deal_id, value, status, closing_date")
      .eq("sync_status", "synced")
      .in("status", ["1", "won"])
      .not("closing_date", "is", null)
      .gte("closing_date", startDate)
      .lte("closing_date", endDate);

    if (wonError) {
      console.error("❌ Error fetching won deals:", wonError);
      return NextResponse.json({ error: wonError.message }, { status: 500 });
    }

    // Fetch open deals (status=0) with value > 0, desde 01/01/2026
    const { data: openDeals, error: openError } = await supabase
      .from("deals_cache")
      .select("deal_id, value, status, last_synced_at")
      .eq("sync_status", "synced")
      .eq("status", "0")
      .gt("value", 0)
      .not("last_synced_at", "is", null)
      .gte("last_synced_at", "2026-01-01")
      .lte("last_synced_at", endDate + "T23:59:59");

    if (openError) {
      console.error("❌ Error fetching open deals:", openError);
      return NextResponse.json({ error: openError.message }, { status: 500 });
    }

    // Fetch monthly target from ote_monthly_targets
    const { data: targetData } = await supabase
      .from("ote_monthly_targets")
      .select("target_amount")
      .eq("month", month + 1)
      .eq("year", year)
      .single();

    const monthlyTarget = parseFloat(targetData?.target_amount) || 0;
    // Daily meta: linear progression to reach monthlyTarget on last day
    const dailyMetaIncrement =
      totalDaysInMonth > 0 ? monthlyTarget / totalDaysInMonth : 0;

    // Build daily aggregations
    const dailyRevenue: Record<number, number> = {};
    const dailyForecast: Record<number, number> = {};
    for (let d = 1; d <= totalDaysInMonth; d++) {
      dailyRevenue[d] = 0;
      dailyForecast[d] = 0;
    }

    // Revenue: won deals accumulated by closing_date day
    // closing_date is a plain DATE string ("YYYY-MM-DD"); extract via split("T")[0]
    // to match /dashboard exactly and avoid any timezone shift.
    (wonDeals || []).forEach((deal) => {
      const dateStr = deal.closing_date?.split("T")[0];
      if (!dateStr) return;
      const [dealYear, dealMonth, day] = dateStr.split("-").map(Number);

      // Only count deals from the current month
      if (dealYear !== year || dealMonth !== month + 1) return;
      if (day < 1 || day > totalDaysInMonth) return;
      // AC stores values in centavos, divide by 100
      dailyRevenue[day] += (parseFloat(deal.value) || 0) / 100;
    });

    // Forecast: open deals accumulated by last_synced_at day (UTC-3)
    (openDeals || []).forEach((deal) => {
      const syncDate = new Date(deal.last_synced_at);
      // Adjust to UTC-3
      const syncDateUTC3 = new Date(syncDate.getTime() - 3 * 60 * 60 * 1000);
      const dealYear = syncDateUTC3.getUTCFullYear();
      const dealMonth = syncDateUTC3.getUTCMonth();
      const day = syncDateUTC3.getUTCDate();

      // Only count deals from the current month
      if (dealYear !== year || dealMonth !== month) return;
      if (day < 1 || day > totalDaysInMonth) return;
      // AC stores values in centavos, divide by 100
      dailyForecast[day] += (parseFloat(deal.value) || 0) / 100;
    });

    // Build cumulative chart data
    let cumulativeRevenue = 0;
    let cumulativeForecast = 0;
    const chartData = [];

    for (let d = 1; d <= totalDaysInMonth; d++) {
      cumulativeRevenue += dailyRevenue[d];
      // Forecast accumulates up to today, then stays flat
      if (d <= todayDay) {
        cumulativeForecast += dailyForecast[d];
      }

      const pace =
        d > 0 && d <= todayDay
          ? (cumulativeRevenue / d) * totalDaysInMonth
          : null;

      // Meta: linear growth — day d reaches monthlyTarget on last day
      const metaForDay = Math.round(dailyMetaIncrement * d * 100) / 100;

      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

      chartData.push({
        date: dateStr,
        day: d,
        revenue:
          d <= todayDay ? Math.round(cumulativeRevenue * 100) / 100 : null,
        meta: metaForDay,
        forecast:
          d <= todayDay ? Math.round(cumulativeForecast * 100) / 100 : null,
        pace: pace !== null ? Math.round(pace * 100) / 100 : null,
      });
    }

    const finalForecast = Math.round(cumulativeForecast * 100) / 100;

    return NextResponse.json({
      success: true,
      month: month + 1,
      year,
      todayDay,
      totalDaysInMonth,
      monthlyTarget,
      totalRevenue: Math.round(cumulativeRevenue * 100) / 100,
      totalForecast: finalForecast,
      chartData,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ Live dashboard error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
