import { NextResponse } from "next/server";
import { createClient, createSupabaseServerForSync } from "@/lib/supabase/server";
import { fetchAllSupabaseRows } from "@/lib/supabase-pagination";
import { isTrainingBlocked } from "@/lib/sellers-v2/arena-access";
import {
  brtDay,
  playerProgress,
  scoreSessions,
  SEASON_ONE_START,
  seasonDaysLeft,
  seasonLabel,
  seasonRanking,
  type TrainingSessionLite,
} from "@/lib/sellers-v2/progression";

interface SessionRow {
  id: string;
  user_id: string | null;
  seller_name: string;
  score: number | null;
  started_at: string;
  status: string;
  deadline_at: string;
}

const EXPIRED_EVALUATION = {
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
};

/**
 * Arena: progresso de quem está vendo (XP, nível, sequência, meta da semana),
 * ranking da temporada (mês) e o pódio. Só treino conta; vendas ficam no OTE.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    const admin = await createSupabaseServerForSync();
    const now = Date.now();

    // Treino abandonado depois do prazo conta como resultado zero (regra antiga, mantida).
    const expiredAt = new Date(now).toISOString();
    await admin
      .from("seller_training_sessions")
      .update({
        ended_at: expiredAt,
        score: 0,
        status: "expired",
        completion_reason: "timeout",
        evaluation: EXPIRED_EVALUATION,
        updated_at: expiredAt,
      })
      .eq("status", "active")
      .lte("deadline_at", new Date(now - 2 * 60 * 1000).toISOString());

    const [sessions, { data: profiles, error: profilesError }] = await Promise.all([
      fetchAllSupabaseRows<SessionRow>(
        (from, to) =>
          admin
            .from("seller_training_sessions")
            .select("id, user_id, seller_name, score, started_at, status, deadline_at")
            .gte("started_at", `${SEASON_ONE_START}T03:00:00Z`)
            .order("started_at", { ascending: true })
            .range(from, to),
        "seller_training_sessions",
      ),
      admin.from("user_profiles").select("id, first_name, last_name, email, avatar_url, role").eq("approved", true),
    ]);
    if (profilesError) throw profilesError;

    const profileOf = new Map((profiles ?? []).map((p) => [p.id as string, p]));
    const nameOf = (userId: string, fallback?: string) => {
      const p = profileOf.get(userId);
      return (
        [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() ||
        fallback ||
        (p?.email as string | undefined)?.split("@")[0] ||
        "Vendedor"
      );
    };

    const lite: TrainingSessionLite[] = sessions
      .filter((s) => s.user_id)
      .map((s) => ({ userId: s.user_id as string, startedAt: s.started_at, score: s.score, status: s.status }));
    const trainers = [...new Set(lite.map((s) => s.userId))].filter((id) => !isTrainingBlocked(profileOf.get(id)));
    const ranking = seasonRanking(trainers.map((id) => playerProgress(id, lite, now))).map((p, i) => ({
      posicao: i + 1,
      userId: p.userId,
      nome: nameOf(p.userId, sessions.find((s) => s.user_id === p.userId)?.seller_name),
      avatarUrl: (profileOf.get(p.userId)?.avatar_url as string | null) ?? null,
      seasonXp: p.seasonXp,
      nivel: p.level.name,
      mediaNota: p.seasonAvgScore,
      treinos: p.seasonSessions,
      sequencia: p.streak,
    }));

    const myProfile = profileOf.get(user.id);
    const me = playerProgress(user.id, lite, now);
    const myScored = scoreSessions(lite.filter((s) => s.userId === user.id));
    const xpBySession = new Map<string, number>();
    for (const scored of myScored) {
      const row = sessions.find((s) => s.user_id === user.id && s.started_at === scored.startedAt);
      if (row) xpBySession.set(row.id, scored.xp);
    }
    const today = brtDay(now);
    const mySessions = sessions.filter((s) => s.user_id === user.id);
    const todayScores = mySessions
      .filter((s) => s.status === "completed" && s.score != null && brtDay(Date.parse(s.started_at)) === today)
      .map((s) => s.score as number);
    const active = mySessions.find((s) => s.status === "active" && Date.parse(s.deadline_at) > now);
    const weekdayToday = new Date(Date.parse(`${today}T12:00:00Z`)).getUTCDay();

    const label = seasonLabel(now);
    return NextResponse.json(
      {
        temporada: { ...label, diasRestantes: seasonDaysLeft(now) },
        me: {
          nome: nameOf(user.id),
          avatarUrl: (myProfile?.avatar_url as string | null) ?? null,
          bloqueado: isTrainingBlocked(myProfile),
          totalXp: me.totalXp,
          seasonXp: me.seasonXp,
          nivel: me.level,
          sequencia: me.streak,
          treinouHoje: me.trainedToday,
          diasDaSemana: me.weekDays,
          mediaNota: me.seasonAvgScore,
          posicao: ranking.find((r) => r.userId === user.id)?.posicao ?? null,
          treinoAtivoId: active?.id ?? null,
          xpPorTreino: Object.fromEntries(xpBySession),
        },
        ranking,
        // Formato antigo, usado pelos medidores do simulador.
        currentUserTraining: {
          todayScore: todayScores.length ? Math.max(...todayScores) : null,
          daysTrained: me.weekDays.length,
          totalDays: 5,
          elapsedDays: Math.min(5, Math.max(1, weekdayToday === 0 || weekdayToday === 6 ? 5 : weekdayToday)),
          trainedWeekdays: me.weekDays,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Rankings API error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}
