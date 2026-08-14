import { getSupabaseSecretKey } from "@/lib/supabase/keys-server";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireApprovedUser } from "@/lib/security/route-guards";
import { getLiveDashboardPeriod } from "@/lib/live-dashboard-period";
import { hasOfficialMockupTag } from "@/lib/live-dashboard-forecast";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey(),
);

export async function GET() {
  try {
    const access = await requireApprovedUser();
    if (!access.ok) return access.response;

    const {
      year,
      monthIndex: month,
      todayDay,
      startDay,
      totalDaysInMonth,
      countedDays,
      elapsedDays,
      startDate,
      endDate,
    } = getLiveDashboardPeriod();

    // Fetch won deals (status "1" or "won") with closing_date in current month
    // Source: deals_cache (same as /dashboard) for consistency
    const { data: wonDeals, error: wonError } = await supabase
      .from("deals_cache")
      .select("deal_id, value, status, closing_date")
      .eq("source_system", "ghl")
      .eq("sync_status", "synced")
      .in("status", ["1", "won"])
      .not("closing_date", "is", null)
      .gte("closing_date", startDate)
      .lte("closing_date", endDate);

    if (wonError) {
      console.error("❌ Error fetching won deals:", wonError);
      return NextResponse.json({ error: wonError.message }, { status: 500 });
    }

    // Forecast candidates: only open GHL deals with value > 0.
    const { data: openDeals, error: openError } = await supabase
      .from("deals_cache")
      .select("deal_id, contact_id, value, status, last_synced_at")
      .eq("source_system", "ghl")
      .eq("sync_status", "synced")
      .eq("status", "open")
      .gt("value", 0)
      // Exclude clearly invalid CRM input (e.g. a Unix timestamp entered as BRL).
      .lt("value", 1_000_000_000)
      .not("last_synced_at", "is", null)
      .gte("last_synced_at", "2026-01-01")
      .lte("last_synced_at", endDate + "T23:59:59");

    if (openError) {
      console.error("❌ Error fetching open deals:", openError);
      return NextResponse.json({ error: openError.message }, { status: 500 });
    }

    // A deal only belongs to the forecast while its current GHL contact has
    // the "Solicitou Mockup Oficial" tag. Read the synchronized raw contact
    // payload in chunks to avoid oversized `in` query strings.
    const contactIds = Array.from(
      new Set(
        (openDeals || [])
          .map((deal) => deal.contact_id)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const taggedContactIds = new Set<string>();

    for (let index = 0; index < contactIds.length; index += 500) {
      const { data: contacts, error: contactsError } = await supabase
        .from("ghl_contacts")
        .select("id, raw")
        .in("id", contactIds.slice(index, index + 500));

      if (contactsError) {
        console.error("Error fetching GHL contact tags:", contactsError);
        return NextResponse.json(
          { error: contactsError.message },
          { status: 500 },
        );
      }

      (contacts || []).forEach((contact) => {
        if (hasOfficialMockupTag(contact.raw)) taggedContactIds.add(contact.id);
      });
    }

    const forecastDeals = (openDeals || []).filter(
      (deal) => deal.contact_id && taggedContactIds.has(deal.contact_id),
    );

    // Fetch monthly target from ote_monthly_targets
    const { data: targetData } = await supabase
      .from("ote_monthly_targets")
      .select("target_amount")
      .eq("month", month + 1)
      .eq("year", year)
      .single();

    const monthlyTarget = parseFloat(targetData?.target_amount) || 0;
    // Daily meta: linear progression to reach monthlyTarget on last day
    const dailyMetaIncrement = countedDays > 0 ? monthlyTarget / countedDays : 0;

    // Build daily aggregations
    const dailyRevenue: Record<number, number> = {};
    const dailyForecast: Record<number, number> = {};
    for (let d = startDay; d <= totalDaysInMonth; d++) {
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
      if (day < startDay || day > totalDaysInMonth) return;
      // AC stores values in centavos, divide by 100
      dailyRevenue[day] += (parseFloat(deal.value) || 0) / 100;
    });

    // Forecast: open deals accumulated by last_synced_at day (UTC-3)
    forecastDeals.forEach((deal) => {
      const syncDate = new Date(deal.last_synced_at);
      // Adjust to UTC-3
      const syncDateUTC3 = new Date(syncDate.getTime() - 3 * 60 * 60 * 1000);
      const dealYear = syncDateUTC3.getUTCFullYear();
      const dealMonth = syncDateUTC3.getUTCMonth();
      const day = syncDateUTC3.getUTCDate();

      // Only count deals from the current month
      if (dealYear !== year || dealMonth !== month) return;
      if (day < startDay || day > totalDaysInMonth) return;
      // AC stores values in centavos, divide by 100
      dailyForecast[day] += (parseFloat(deal.value) || 0) / 100;
    });

    // Build cumulative chart data
    let cumulativeRevenue = 0;
    let cumulativeForecast = 0;
    const chartData = [];

    for (let d = startDay; d <= totalDaysInMonth; d++) {
      cumulativeRevenue += dailyRevenue[d];
      // Forecast accumulates up to today, then stays flat
      if (d <= todayDay) {
        cumulativeForecast += dailyForecast[d];
      }

      const elapsedThroughDay = d - startDay + 1;
      const pace =
        d <= todayDay
          ? (cumulativeRevenue / elapsedThroughDay) * countedDays
          : null;

      // Meta: linear growth — day d reaches monthlyTarget on last day
      const metaForDay =
        Math.round(dailyMetaIncrement * elapsedThroughDay * 100) / 100;

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
      startDay,
      totalDaysInMonth,
      countedDays,
      elapsedDays,
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
