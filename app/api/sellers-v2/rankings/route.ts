import { NextRequest, NextResponse } from "next/server";
import {
  createClient,
  createSupabaseServerForSync,
} from "@/lib/supabase/server";
import { fetchAllSupabaseRows } from "@/lib/supabase-pagination";

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
    const trainingAdmin = await createSupabaseServerForSync();

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
    const currentMonthDeals = await fetchAllSupabaseRows<any>(
      (from, to) =>
        supabase
          .from("deals_cache")
          .select("vendedor, value")
          .gte("closing_date", firstDayOfMonth)
          .eq("source_system", "ghl")
          .eq("sync_status", "synced")
          .lte("closing_date", lastDayOfMonth)
          .in("status", ["won", "1"])
          .not("vendedor", "is", null)
          .neq("vendedor", "")
          .order("deal_id", { ascending: true })
          .range(from, to),
      "Current month seller ranking read failed",
    );

    // Fetch all year won deals (for record ranking)
    const yearDeals = await fetchAllSupabaseRows<any>(
      (from, to) =>
        supabase
          .from("deals_cache")
          .select("vendedor, value, closing_date")
          .gte("closing_date", firstDayOfYear)
          .lte("closing_date", lastDayOfYear)
          .eq("source_system", "ghl")
          .eq("sync_status", "synced")
          .in("status", ["won", "1"])
          .not("vendedor", "is", null)
          .neq("vendedor", "")
          .order("deal_id", { ascending: true })
          .range(from, to),
      "Year seller ranking read failed",
    );

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
    currentMonthDeals.forEach((deal) => {
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
    yearDeals.forEach((deal) => {
      const name = normalizeName(deal.vendedor || "");
      if (!name) return;
      const monthKey = String(deal.closing_date).slice(0, 7);
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

    // Training days run from 01:00 through 23:59:59.999 in Brasília time.
    // Sessions abandoned past their deadline count as a poor (zero) result.
    const expiredAt = new Date().toISOString();
    const abandonedBefore = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    await trainingAdmin
      .from("seller_training_sessions")
      .update({
        ended_at: expiredAt,
        score: 0,
        status: "expired",
        completion_reason: "timeout",
        evaluation: {
          score: 0,
          classification: "Crítico",
          hasCriticalError: false,
          report: {
            naoAvaliavel: false,
            motivoNaoAvaliavel: "",
            resumo: "Treinamento abandonado antes da conclusão.",
            notasPorCriterio: {
              precisaoInformacoes: 0,
              entendimentoNecessidade: 0,
              construcaoValor: 0,
              conducaoProximoPasso: 0,
              clarezaComunicacao: 0,
            },
            evidencias: [],
            acertos: [],
            falhas: ["Treinamento abandonado antes da conclusão."],
            errosCriticos: [],
            exemploRespostaMelhor: "Conclua os 15 minutos do treinamento.",
          },
        },
        updated_at: expiredAt,
      })
      .eq("status", "active")
      .lte("deadline_at", abandonedBefore);

    // Fetch training sessions for weekly ranking (Monday–Friday in BRT)
    const brtDayOfWeek = nowBRT.getUTCDay(); // 0=Sun, 1=Mon...6=Sat in BRT
    const daysToMonday = brtDayOfWeek === 0 ? -6 : 1 - brtDayOfWeek;
    const mondayBRT = brtToUTC(
      nowBRT.getUTCFullYear(),
      nowBRT.getUTCMonth(),
      nowBRT.getUTCDate() + daysToMonday,
      1,
      0,
      0,
      0,
    );
    const fridayBRT = brtToUTC(
      nowBRT.getUTCFullYear(),
      nowBRT.getUTCMonth(),
      nowBRT.getUTCDate() + daysToMonday + 4,
      23,
      59,
      59,
      999,
    ); // Friday 23:59:59 BRT → Saturday 02:59:59 UTC

    const { data: trainingSessions, error: trainingError } = await trainingAdmin
      .from("seller_training_sessions")
      .select("id, user_id, seller_name, score, started_at, ended_at, status")
      .gte("started_at", mondayBRT.toISOString())
      .lte("started_at", fridayBRT.toISOString())
      .not("score", "is", null);
    if (trainingError) throw trainingError;

    type TrainingRow = NonNullable<typeof trainingSessions>[number];
    const bestBySellerDay = new Map<string, TrainingRow>();
    trainingSessions?.forEach((session) => {
      const sessionBRT = new Date(
        new Date(session.started_at).getTime() - BRT_OFFSET_MS,
      );
      if (sessionBRT.getUTCHours() < 1) return;
      const day = `${sessionBRT.getUTCFullYear()}-${String(sessionBRT.getUTCMonth() + 1).padStart(2, "0")}-${String(sessionBRT.getUTCDate()).padStart(2, "0")}`;
      const sellerKey = session.user_id || normalizeName(session.seller_name);
      const key = `${sellerKey}:${day}`;
      const current = bestBySellerDay.get(key);
      const currentScore = Number(current?.score ?? -1);
      const candidateScore = Number(session.score ?? -1);
      const currentTime = current
        ? new Date(current.ended_at || current.started_at).getTime()
        : 0;
      const candidateTime = new Date(
        session.ended_at || session.started_at,
      ).getTime();
      if (
        !current ||
        candidateScore > currentScore ||
        (candidateScore === currentScore && candidateTime >= currentTime)
      ) {
        bestBySellerDay.set(key, session);
      }
    });

    // Calculate weekly training ranking — all dates/days in BRT
    const trainingMap: Record<
      string,
      { scores: number[]; days: Set<string>; trainedWeekdays: Set<number> }
    > = {};
    bestBySellerDay.forEach((s) => {
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
      trainingMap[name].scores.push(Number(s.score));
      trainingMap[name].days.add(day);
      if (weekday >= 1 && weekday <= 5) {
        trainingMap[name].trainedWeekdays.add(weekday);
      }
    });

    const workdaysInWeek = 5;
    const workdaysElapsed = Math.min(
      Math.max(
        brtDayOfWeek === 0 ? 5 : brtDayOfWeek === 6 ? 5 : brtDayOfWeek,
        1,
      ),
      workdaysInWeek,
    );

    const trainingRanking = Object.entries(trainingMap)
      .map(([name, data]) => ({
        name,
        avgScore: Math.round(
          data.scores.reduce((a, b) => a + b, 0) / data.scores.length,
        ),
        daysTrained: data.trainedWeekdays.size,
        totalDays: workdaysInWeek,
        trainedWeekdays: Array.from(data.trainedWeekdays), // 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri
        avatarUrl: avatarMap[name.toLowerCase()] || null,
      }))
      .sort((a, b) => b.avgScore - a.avgScore);

    const todayKey = `${nowBRT.getUTCFullYear()}-${String(nowBRT.getUTCMonth() + 1).padStart(2, "0")}-${String(nowBRT.getUTCDate()).padStart(2, "0")}`;
    const currentUserSessions = Array.from(bestBySellerDay.entries()).filter(
      ([key, session]) => session.user_id === user.id || key.startsWith(`${user.id}:`),
    );
    const todaySession = currentUserSessions.find(([key]) =>
      key.endsWith(`:${todayKey}`),
    )?.[1];
    const currentUserWeekdays = Array.from(
      new Set(
        currentUserSessions
          .map(([, session]) => {
            const local = new Date(
              new Date(session.started_at).getTime() - BRT_OFFSET_MS,
            );
            return local.getUTCDay();
          })
          .filter((weekday) => weekday >= 1 && weekday <= 5),
      ),
    );
    const currentUserTraining = {
      todayScore: todaySession?.score ?? null,
      daysTrained: currentUserWeekdays.length,
      totalDays: workdaysInWeek,
      elapsedDays: workdaysElapsed,
      trainedWeekdays: currentUserWeekdays,
    };

    return NextResponse.json({
      currentMonthRanking,
      recordRanking,
      trainingRanking,
      currentUserTraining,
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
