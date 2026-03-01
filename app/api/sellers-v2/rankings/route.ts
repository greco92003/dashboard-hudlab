import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    // Brasília is UTC-3. Shift Date so getUTC* methods return BRT local values.
    const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
    const nowBRT = new Date(Date.now() - BRT_OFFSET_MS);

    // Convert a BRT local date/time to the equivalent UTC Date for DB queries.
    // BRT 00:00 = UTC 03:00, so we add BRT_OFFSET_MS back to the UTC representation.
    const brtToUTC = (
      year: number,
      month: number, // 0-indexed
      day: number,
      h = 0,
      m = 0,
      s = 0,
      ms = 0,
    ): Date =>
      new Date(Date.UTC(year, month, day, h, m, s, ms) + BRT_OFFSET_MS);

    const currentMonth = nowBRT.getUTCMonth() + 1;
    const currentYear = nowBRT.getUTCFullYear();

    // Get first/last day of current month in BRT, expressed as UTC for DB
    const firstDayOfMonth = brtToUTC(
      currentYear,
      nowBRT.getUTCMonth(),
      1,
    ).toISOString();
    const lastDayOfMonth = brtToUTC(
      currentYear,
      nowBRT.getUTCMonth() + 1, // day=0 rolls back to last day of previous month
      0,
      23,
      59,
      59,
      999,
    ).toISOString();

    // Get first/last day of current year in BRT, expressed as UTC for DB
    const firstDayOfYear = brtToUTC(currentYear, 0, 1).toISOString();
    const lastDayOfYear = brtToUTC(
      currentYear,
      11,
      31,
      23,
      59,
      59,
      999,
    ).toISOString();

    // Fetch current month won deals
    const { data: currentMonthDeals, error: monthError } = await supabase
      .from("deals_cache")
      .select("vendedor, value")
      .gte("closing_date", firstDayOfMonth)
      .lte("closing_date", lastDayOfMonth)
      .in("status", ["won", "1"])
      .not("vendedor", "is", null)
      .neq("vendedor", "");

    if (monthError) {
      console.error("Error fetching month deals:", monthError);
      return NextResponse.json(
        { error: "Erro ao buscar dados" },
        { status: 500 },
      );
    }

    // Fetch all year won deals (for record ranking)
    const { data: yearDeals, error: yearError } = await supabase
      .from("deals_cache")
      .select("vendedor, value, closing_date")
      .gte("closing_date", firstDayOfYear)
      .lte("closing_date", lastDayOfYear)
      .in("status", ["won", "1"])
      .not("vendedor", "is", null)
      .neq("vendedor", "");

    if (yearError) {
      console.error("Error fetching year deals:", yearError);
      return NextResponse.json(
        { error: "Erro ao buscar dados" },
        { status: 500 },
      );
    }

    // Fetch user profiles for avatar mapping
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("first_name, avatar_url")
      .eq("approved", true);

    // Build avatar map: normalized first_name -> avatar_url
    const avatarMap: Record<string, string> = {};
    profiles?.forEach((p) => {
      if (p.first_name && p.avatar_url) {
        avatarMap[p.first_name.trim().toLowerCase()] = p.avatar_url;
      }
    });

    // Ranking 1: Current month sales by seller
    const monthSalesMap: Record<string, number> = {};
    currentMonthDeals?.forEach((deal) => {
      const name = normalizeName(deal.vendedor || "");
      if (!name) return;
      monthSalesMap[name] =
        (monthSalesMap[name] || 0) + (Number(deal.value) || 0) / 100;
    });

    const currentMonthRanking = Object.entries(monthSalesMap)
      .map(([name, total]) => ({
        name,
        totalSales: total,
        avatarUrl: avatarMap[name.toLowerCase()] || null,
      }))
      .sort((a, b) => b.totalSales - a.totalSales);

    // Ranking 2: Best single-month record per seller in current year
    const monthlyTotals: Record<string, Record<string, number>> = {};
    yearDeals?.forEach((deal) => {
      const name = normalizeName(deal.vendedor || "");
      if (!name) return;
      const closingDate = new Date(deal.closing_date);
      const monthKey = `${closingDate.getFullYear()}-${String(closingDate.getMonth() + 1).padStart(2, "0")}`;
      if (!monthlyTotals[name]) monthlyTotals[name] = {};
      monthlyTotals[name][monthKey] =
        (monthlyTotals[name][monthKey] || 0) + (Number(deal.value) || 0) / 100;
    });

    const MONTH_NAMES = [
      "Jan",
      "Fev",
      "Mar",
      "Abr",
      "Mai",
      "Jun",
      "Jul",
      "Ago",
      "Set",
      "Out",
      "Nov",
      "Dez",
    ];
    const recordRanking = Object.entries(monthlyTotals)
      .map(([name, months]) => {
        const bestMonth = Object.entries(months).reduce(
          (best, [month, total]) =>
            total > best.total ? { month, total } : best,
          { month: "", total: 0 },
        );
        const monthNum = parseInt(bestMonth.month.split("-")[1]) - 1;
        return {
          name,
          recordSales: bestMonth.total,
          recordMonth: `${MONTH_NAMES[monthNum]}/${bestMonth.month.split("-")[0]}`,
          avatarUrl: avatarMap[name.toLowerCase()] || null,
        };
      })
      .sort((a, b) => b.recordSales - a.recordSales);

    // Fetch training sessions for weekly ranking (Monday–Friday in BRT)
    const brtDayOfWeek = nowBRT.getUTCDay(); // 0=Sun, 1=Mon...6=Sat in BRT
    const daysToMonday = brtDayOfWeek === 0 ? -6 : 1 - brtDayOfWeek;
    const mondayBRT = brtToUTC(
      nowBRT.getUTCFullYear(),
      nowBRT.getUTCMonth(),
      nowBRT.getUTCDate() + daysToMonday,
      0,
      0,
      0,
      0,
    ); // Monday 00:00 BRT → 03:00 UTC
    const fridayBRT = brtToUTC(
      nowBRT.getUTCFullYear(),
      nowBRT.getUTCMonth(),
      nowBRT.getUTCDate() + daysToMonday + 4,
      23,
      59,
      59,
      999,
    ); // Friday 23:59:59 BRT → Saturday 02:59:59 UTC

    const { data: trainingSessions } = await supabase
      .from("seller_training_sessions")
      .select("seller_name, score, started_at")
      .gte("started_at", mondayBRT.toISOString())
      .lte("started_at", fridayBRT.toISOString())
      .not("score", "is", null);

    // Calculate weekly training ranking — all dates/days in BRT
    const trainingMap: Record<
      string,
      { scores: number[]; days: Set<string>; trainedWeekdays: Set<number> }
    > = {};
    trainingSessions?.forEach((s) => {
      const name = s.seller_name;
      // Convert UTC started_at to BRT local date/weekday
      const sessionBRT = new Date(
        new Date(s.started_at).getTime() - BRT_OFFSET_MS,
      );
      const day = `${sessionBRT.getUTCFullYear()}-${String(sessionBRT.getUTCMonth() + 1).padStart(2, "0")}-${String(sessionBRT.getUTCDate()).padStart(2, "0")}`;
      const weekday = sessionBRT.getUTCDay(); // 0=Sun, 1=Mon...5=Fri in BRT
      if (!trainingMap[name])
        trainingMap[name] = {
          scores: [],
          days: new Set(),
          trainedWeekdays: new Set(),
        };
      trainingMap[name].scores.push(s.score);
      trainingMap[name].days.add(day);
      if (weekday >= 1 && weekday <= 5) {
        trainingMap[name].trainedWeekdays.add(weekday);
      }
    });

    // Count business days elapsed this week (up to today) in BRT
    const businessDaysElapsed = Math.min(
      Math.max(
        brtDayOfWeek === 0 ? 5 : brtDayOfWeek === 6 ? 5 : brtDayOfWeek,
        1,
      ),
      5,
    );

    const trainingRanking = Object.entries(trainingMap)
      .map(([name, data]) => ({
        name,
        avgScore: Math.round(
          data.scores.reduce((a, b) => a + b, 0) / data.scores.length,
        ),
        daysTrained: data.days.size,
        totalDays: businessDaysElapsed,
        trainedWeekdays: Array.from(data.trainedWeekdays), // 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri
        avatarUrl: avatarMap[name.toLowerCase()] || null,
      }))
      .sort((a, b) => b.avgScore - a.avgScore);

    return NextResponse.json({
      currentMonthRanking,
      recordRanking,
      trainingRanking,
      currentMonth,
      currentYear,
    });
  } catch (error: any) {
    console.error("Rankings API error:", error);
    return NextResponse.json(
      { error: error.message || "Erro interno" },
      { status: 500 },
    );
  }
}

function normalizeName(name: string): string {
  if (!name) return "";
  const n = name.trim().toLowerCase();
  if (n === "lawrence" || n === "laurence") return "Lawrence";
  if (n === "willian" || n === "wilian" || n === "william") return "Willian";
  if (n === "schay" || n === "schaiany") return "Schay";
  if (n === "raisa" || n === "raísa") return "Raisa";
  return (
    name.trim().charAt(0).toUpperCase() + name.trim().slice(1).toLowerCase()
  );
}
