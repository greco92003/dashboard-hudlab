// Progressão da Arena: XP, níveis, sequência, meta da semana e temporada.
// Calculado a partir das sessões de treino (nada guardado à parte), então a
// regra pode mudar sem migrar dados. Módulo puro.

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Temporada 1 começa no lançamento da Arena nova; treinos antes disso não contam. */
export const SEASON_ONE_START = "2026-10-14";

export const LEVELS = [
  { name: "Aprendiz", minXp: 0 },
  { name: "Consultor", minXp: 500 },
  { name: "Especialista", minXp: 1500 },
  { name: "Closer", minXp: 3500 },
  { name: "Lenda", minXp: 7000 },
] as const;

export const XP_BONUS_EXCELENCIA = 25; // nota 90+
export const XP_BONUS_PRIMEIRA_VEZ = 20; // primeira vez na missão
export const XP_BONUS_POR_DIA_DE_SEQUENCIA = 10;
export const XP_BONUS_SEQUENCIA_MAX = 50;
/** Treinos por dia que dão XP: evita farmar XP repetindo treino. */
export const MAX_TREINOS_COM_XP_POR_DIA = 3;

export interface TrainingSessionLite {
  userId: string;
  startedAt: string;
  score: number | null;
  status: string;
  /** Missão do treino; sem missão = treino livre ("Cliente surpresa"). */
  missionId?: string | null;
}

export interface ScoredSession extends TrainingSessionLite {
  day: string;
  season: string;
  xp: number;
  bonus: { excelencia: number; primeiraVez: number; sequencia: number };
}

/** Dia em Brasília, "YYYY-MM-DD". */
export function brtDay(ms: number): string {
  return new Date(ms - BRT_OFFSET_MS).toISOString().slice(0, 10);
}

/** Temporada = mês em Brasília, "YYYY-MM". */
export const seasonOf = (ms: number) => brtDay(ms).slice(0, 7);

const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
const isWorkday = (day: string) => weekday(day) >= 1 && weekday(day) <= 5;
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** Dia útil anterior (fim de semana não quebra a sequência). */
export function previousWorkday(day: string): string {
  let d = addDays(day, -1);
  while (!isWorkday(d)) d = addDays(d, -1);
  return d;
}

/** Só treino concluído e avaliado, da Temporada 1 em diante. */
const counts = (s: TrainingSessionLite) =>
  s.status === "completed" && s.score != null && brtDay(Date.parse(s.startedAt)) >= SEASON_ONE_START;

/**
 * XP de cada treino de uma pessoa, em ordem. Base = nota; bônus de 90+,
 * primeira vez na missão e dias seguidos de treino (o dia de hoje não conta
 * como bônus: no 2º dia seguido +10, até +50). Do 4º treino do dia em diante,
 * zero.
 */
export function scoreSessions(sessions: TrainingSessionLite[]): ScoredSession[] {
  const ordered = sessions.filter(counts).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const missionsSeen = new Set<string>();
  const perDay = new Map<string, number>();
  const trainedDays = new Set<string>();
  const out: ScoredSession[] = [];

  for (const s of ordered) {
    const ms = Date.parse(s.startedAt);
    const day = brtDay(ms);
    const n = (perDay.get(day) ?? 0) + 1;
    perDay.set(day, n);
    trainedDays.add(day);

    let streakBefore = 0;
    for (let d = previousWorkday(day); trainedDays.has(d); d = previousWorkday(d)) streakBefore++;

    const mission = s.missionId || "livre";
    const firstTime = !missionsSeen.has(mission);
    missionsSeen.add(mission);

    const score = s.score as number;
    const bonus = {
      excelencia: score >= 90 ? XP_BONUS_EXCELENCIA : 0,
      primeiraVez: firstTime ? XP_BONUS_PRIMEIRA_VEZ : 0,
      sequencia: Math.min(XP_BONUS_SEQUENCIA_MAX, streakBefore * XP_BONUS_POR_DIA_DE_SEQUENCIA),
    };
    const xp = n > MAX_TREINOS_COM_XP_POR_DIA ? 0 : score + bonus.excelencia + bonus.primeiraVez + bonus.sequencia;
    out.push({ ...s, day, season: seasonOf(ms), xp, bonus });
  }
  return out;
}

export interface LevelInfo {
  name: string;
  index: number;
  minXp: number;
  nextName: string | null;
  nextMinXp: number | null;
  /** 0–100 dentro do nível atual; 100 no último. */
  progressPct: number;
}

export function levelFor(totalXp: number): LevelInfo {
  let index = 0;
  LEVELS.forEach((l, i) => {
    if (totalXp >= l.minXp) index = i;
  });
  const current = LEVELS[index];
  const next = LEVELS[index + 1] ?? null;
  return {
    name: current.name,
    index,
    minXp: current.minXp,
    nextName: next?.name ?? null,
    nextMinXp: next?.minXp ?? null,
    progressPct: next ? Math.round(((totalXp - current.minXp) / (next.minXp - current.minXp)) * 100) : 100,
  };
}

export interface PlayerProgress {
  userId: string;
  totalXp: number;
  seasonXp: number;
  level: LevelInfo;
  /** Dias úteis seguidos com treino até hoje (ou até ontem, se hoje ainda não treinou). */
  streak: number;
  trainedToday: boolean;
  /** Dias da semana atual (1 = seg … 5 = sex) com treino concluído. */
  weekDays: number[];
  seasonSessions: number;
  seasonAvgScore: number | null;
  /** Último treino, para desempate (quem chegou antes fica na frente). */
  lastXpAt: string | null;
}

export function playerProgress(userId: string, sessions: TrainingSessionLite[], now: number): PlayerProgress {
  const scored = scoreSessions(sessions.filter((s) => s.userId === userId));
  const season = seasonOf(now);
  const today = brtDay(now);
  const seasonScored = scored.filter((s) => s.season === season);
  const days = new Set(scored.map((s) => s.day));

  const trainedToday = days.has(today);
  let streak = 0;
  let cursor = trainedToday ? today : isWorkday(today) ? previousWorkday(today) : previousWorkday(addDays(today, 1));
  while (days.has(cursor)) {
    streak++;
    cursor = previousWorkday(cursor);
  }

  const monday = addDays(today, -((weekday(today) + 6) % 7));
  const weekDays = [1, 2, 3, 4, 5].filter((wd) => days.has(addDays(monday, wd - 1)));
  const totalXp = scored.reduce((sum, s) => sum + s.xp, 0);

  return {
    userId,
    totalXp,
    seasonXp: seasonScored.reduce((sum, s) => sum + s.xp, 0),
    level: levelFor(totalXp),
    streak,
    trainedToday,
    weekDays,
    seasonSessions: seasonScored.length,
    seasonAvgScore: seasonScored.length
      ? Math.round(seasonScored.reduce((sum, s) => sum + (s.score as number), 0) / seasonScored.length)
      : null,
    lastXpAt: seasonScored.at(-1)?.startedAt ?? null,
  };
}

/** Ranking da temporada: mais XP primeiro; empate, quem chegou antes. Só quem treinou na temporada. */
export function seasonRanking(players: PlayerProgress[]): PlayerProgress[] {
  return players
    .filter((p) => p.seasonSessions > 0)
    .sort((a, b) => b.seasonXp - a.seasonXp || (a.lastXpAt ?? "").localeCompare(b.lastXpAt ?? ""));
}

/** Dias que faltam para a temporada (mês) acabar, contando hoje. */
export function seasonDaysLeft(now: number): number {
  const today = brtDay(now);
  const [y, m] = today.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return lastDay - Number(today.slice(8, 10)) + 1;
}

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/** "Temporada 1 · Outubro" — a numeração conta meses desde a Temporada 1. */
export function seasonLabel(now: number): { numero: number; mes: string } {
  const [y, m] = seasonOf(now).split("-").map(Number);
  const [y1, m1] = SEASON_ONE_START.split("-").map(Number);
  return { numero: Math.max(1, (y - y1) * 12 + (m - m1) + 1), mes: MONTHS[m - 1] };
}
