import "server-only";

import { createSupabaseServerForSync } from "@/lib/supabase/server";
import { fetchAllSupabaseRows } from "@/lib/supabase-pagination";
import { isTrainingBlocked } from "./arena-access";
import { criteriaAverages } from "./arena-text";
import { MISSIONS } from "./missions";
import { brtDay, playerProgress, SEASON_ONE_START, seasonOf, type TrainingSessionLite } from "./progression";

/** Papéis do time que treinam (parceiros e produção não entram na Arena). */
const TEAM_ROLES = ["user", "team-leader", "manager", "admin"];

export interface TeamMember {
  id: string;
  nome: string;
  avatarUrl: string | null;
}

export interface ArenaSessionRow {
  id: string;
  user_id: string;
  score: number | null;
  status: string;
  started_at: string;
  mission_id: string | null;
  evaluation?: { report?: { notasPorCriterio?: Record<string, number> } } | null;
}

export async function loadTeam(): Promise<TeamMember[]> {
  const supabase = await createSupabaseServerForSync();
  const { data, error } = await supabase
    .from("user_profiles")
    .select("id, first_name, last_name, email, avatar_url, role")
    .eq("approved", true)
    .in("role", TEAM_ROLES);
  if (error) throw new Error(`user_profiles: ${error.message}`);
  return (data ?? [])
    .filter((p) => !isTrainingBlocked(p))
    .map((p) => ({
      id: p.id as string,
      nome:
        [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
        (p.email as string | null)?.split("@")[0] ||
        "Sem nome",
      avatarUrl: (p.avatar_url as string | null) ?? null,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export async function loadSeasonSessions(withEvaluation = false): Promise<ArenaSessionRow[]> {
  const supabase = await createSupabaseServerForSync();
  const since = `${SEASON_ONE_START}T03:00:00Z`;
  if (withEvaluation) {
    return fetchAllSupabaseRows<ArenaSessionRow>(
      (from, to) =>
        supabase
          .from("seller_training_sessions")
          .select("id, user_id, score, status, started_at, mission_id, evaluation")
          .gte("started_at", since)
          .not("user_id", "is", null)
          .order("started_at")
          .range(from, to),
      "seller_training_sessions",
    );
  }
  return fetchAllSupabaseRows<ArenaSessionRow>(
    (from, to) =>
      supabase
        .from("seller_training_sessions")
        .select("id, user_id, score, status, started_at, mission_id")
        .gte("started_at", since)
        .not("user_id", "is", null)
        .order("started_at")
        .range(from, to),
    "seller_training_sessions",
  );
}

export const toLite = (rows: ArenaSessionRow[]): TrainingSessionLite[] =>
  rows.map((s) => ({ userId: s.user_id, startedAt: s.started_at, score: s.score, status: s.status, missionId: s.mission_id }));

export interface GestorView {
  pessoas: Array<{
    userId: string;
    nome: string;
    avatarUrl: string | null;
    nivel: string;
    diasDaSemana: number[];
    treinosSemana: number;
    seasonXp: number;
    media: number | null;
    evolucao: number[];
    pontoFraco: string | null;
    treinouHoje: boolean;
  }>;
  time: { treinaramSemana: number; total: number; treinosSemana: number; media: number | null };
  criterios: Array<{ id: string; nome: string; pct: number | null }>;
  missoesDificeis: Array<{ titulo: string; dificuldade: number; media: number; treinos: number }>;
}

/** Visão do gestor: quem treinou, evolução, pontos fracos do time e missões mais difíceis. */
export async function loadGestorView(now = Date.now()): Promise<GestorView> {
  const [team, rows] = await Promise.all([loadTeam(), loadSeasonSessions(true)]);
  const lite = toLite(rows);
  const season = seasonOf(now);
  const today = brtDay(now);
  const weekday = (new Date(Date.parse(`${today}T12:00:00Z`)).getUTCDay() + 6) % 7; // 0 = segunda
  const monday = new Date(Date.parse(`${today}T12:00:00Z`) - weekday * 86400e3).toISOString().slice(0, 10);
  const completed = rows.filter((r) => r.status === "completed" && r.score != null);

  const pessoas = team.map((m) => {
    const p = playerProgress(m.id, lite, now);
    const mine = completed.filter((r) => r.user_id === m.id);
    const seasonRows = mine.filter((r) => seasonOf(Date.parse(r.started_at)) === season);
    const weekRows = mine.filter((r) => brtDay(Date.parse(r.started_at)) >= monday);
    const weakest = criteriaAverages(seasonRows)
      .filter((c) => c.pct != null)
      .sort((a, b) => (a.pct as number) - (b.pct as number))[0];
    return {
      userId: m.id,
      nome: m.nome,
      avatarUrl: m.avatarUrl,
      nivel: p.level.name,
      diasDaSemana: p.weekDays,
      treinosSemana: weekRows.length,
      seasonXp: p.seasonXp,
      media: p.seasonAvgScore,
      evolucao: seasonRows.slice(-6).map((r) => r.score as number),
      pontoFraco: weakest?.nome ?? null,
      treinouHoje: p.trainedToday,
    };
  });

  const weekRows = completed.filter((r) => brtDay(Date.parse(r.started_at)) >= monday && team.some((m) => m.id === r.user_id));
  const seasonTeamRows = completed.filter((r) => seasonOf(Date.parse(r.started_at)) === season && team.some((m) => m.id === r.user_id));
  const byMission = new Map<string, number[]>();
  for (const r of seasonTeamRows) {
    if (!r.mission_id) continue;
    byMission.set(r.mission_id, [...(byMission.get(r.mission_id) ?? []), r.score as number]);
  }
  const missoesDificeis = [...byMission]
    .map(([id, scores]) => {
      const m = MISSIONS.find((x) => x.id === id);
      return m
        ? { titulo: m.titulo, dificuldade: m.dificuldade, media: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length), treinos: scores.length }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => a.media - b.media)
    .slice(0, 4);

  return {
    pessoas,
    time: {
      treinaramSemana: pessoas.filter((p) => p.treinosSemana > 0).length,
      total: pessoas.length,
      treinosSemana: weekRows.length,
      media: seasonTeamRows.length
        ? Math.round(seasonTeamRows.reduce((sum, r) => sum + (r.score as number), 0) / seasonTeamRows.length)
        : null,
    },
    criterios: criteriaAverages(seasonTeamRows),
    missoesDificeis,
  };
}
