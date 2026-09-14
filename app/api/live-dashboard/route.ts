import { getSupabaseSecretKey } from "@/lib/supabase/keys-server";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireApprovedUser } from "@/lib/security/route-guards";
import { getLiveDashboardPeriod } from "@/lib/live-dashboard-period";
import { hasOfficialMockupTag } from "@/lib/live-dashboard-forecast";
import { normalizeGhlDealStatus } from "@/lib/ghl/pipelines";

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
      todayDate,
      startDay,
      totalDaysInMonth,
      countedDays,
      elapsedDays,
      startDate,
      endDate,
      dates,
    } = getLiveDashboardPeriod();

    // Fetch won deals (status "1" or "won") with closing_date in current month
    // Source: deals_cache (same as /dashboard) for consistency
    const { data: monthlyDeals, error: wonError } = await supabase
      .from("deals_cache")
      .select("deal_id, value, status, pipeline_id, stage_id, closing_date")
      .eq("source_system", "ghl")
      .eq("sync_status", "synced")
      .not("closing_date", "is", null)
      .gte("closing_date", startDate)
      .lte("closing_date", endDate);

    if (wonError) {
      console.error("❌ Error fetching won deals:", wonError);
      return NextResponse.json({ error: wonError.message }, { status: 500 });
    }

    // Match /dashboard: GHL may reset a completed sale to `open` when it is
    // moved into the operational Mockup Factory pipeline.
    const wonDeals = (monthlyDeals || []).filter(
      (deal) =>
        normalizeGhlDealStatus(
          deal.pipeline_id,
          deal.stage_id,
          deal.status,
          deal.value,
        ) === "won",
    );

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
    const dailyRevenue: Record<string, number> = {};
    const dailyForecast: Record<string, number> = {};
    for (const date of dates) {
      dailyRevenue[date] = 0;
      dailyForecast[date] = 0;
    }

    // Revenue: won deals accumulated by closing_date day
    // closing_date is a plain DATE string ("YYYY-MM-DD"); extract via split("T")[0]
    // to match /dashboard exactly and avoid any timezone shift.
    (wonDeals || []).forEach((deal) => {
      const dateStr = deal.closing_date?.split("T")[0];
      if (!dateStr) return;
      if (!(dateStr in dailyRevenue)) return;
      // AC stores values in centavos, divide by 100
      dailyRevenue[dateStr] += (parseFloat(deal.value) || 0) / 100;
    });

    // Forecast: open deals accumulated by last_synced_at day (UTC-3)
    forecastDeals.forEach((deal) => {
      const syncDate = new Date(deal.last_synced_at);
      // Adjust to UTC-3
      const syncDateUTC3 = new Date(syncDate.getTime() - 3 * 60 * 60 * 1000);
      const syncDateStr = [
        syncDateUTC3.getUTCFullYear(),
        String(syncDateUTC3.getUTCMonth() + 1).padStart(2, "0"),
        String(syncDateUTC3.getUTCDate()).padStart(2, "0"),
      ].join("-");
      if (!(syncDateStr in dailyForecast)) return;
      // AC stores values in centavos, divide by 100
      dailyForecast[syncDateStr] += (parseFloat(deal.value) || 0) / 100;
    });

    // Build cumulative chart data
    let cumulativeRevenue = 0;
    let cumulativeForecast = 0;
    const chartData = [];

    for (const [index, dateStr] of dates.entries()) {
      const day = Number(dateStr.slice(-2));
      const isElapsed = dateStr <= todayDate;
      cumulativeRevenue += dailyRevenue[dateStr];
      // Forecast accumulates up to today, then stays flat
      if (isElapsed) {
        cumulativeForecast += dailyForecast[dateStr];
      }

      const elapsedThroughDay = index + 1;
      const pace =
        isElapsed
          ? (cumulativeRevenue / elapsedThroughDay) * countedDays
          : null;

      // Meta: linear growth — day d reaches monthlyTarget on last day
      const metaForDay =
        Math.round(dailyMetaIncrement * elapsedThroughDay * 100) / 100;

      chartData.push({
        date: dateStr,
        day,
        revenue:
          isElapsed ? Math.round(cumulativeRevenue * 100) / 100 : null,
        meta: metaForDay,
        forecast:
          isElapsed ? Math.round(cumulativeForecast * 100) / 100 : null,
        pace: pace !== null ? Math.round(pace * 100) / 100 : null,
      });
    }

    const finalForecast = Math.round(cumulativeForecast * 100) / 100;

    return NextResponse.json({
      success: true,
      month: month + 1,
      year,
      todayDay,
      todayDate,
      startDay,
      totalDaysInMonth,
      countedDays,
      elapsedDays,
      startDate,
      endDate,
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
