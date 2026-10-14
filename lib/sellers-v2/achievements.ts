// Conquistas da Arena, calculadas a partir dos treinos. Módulo puro.
import { MISSIONS, TRILHA_NOTA_MINIMA, weeklyChallenge } from "./missions";
import {
  playerProgress,
  previousWorkday,
  scoreSessions,
  seasonOf,
  seasonRanking,
  type ScoredSession,
  type TrainingSessionLite,
} from "./progression";

export interface AchievementDef {
  id: string;
  titulo: string;
  descricao: string;
  /** Nome do ícone (lucide) usado na tela. */
  icone: "play" | "check" | "star" | "flame" | "crown" | "route" | "bolt" | "trophy";
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: "primeiro-treino", titulo: "Primeiro treino", descricao: "Concluiu o primeiro treino da Arena.", icone: "play" },
  { id: "aprovado", titulo: "Aprovado", descricao: "Tirou 70 ou mais num treino.", icone: "check" },
  { id: "excelencia", titulo: "Excelência", descricao: "Tirou 90 ou mais num treino.", icone: "star" },
  { id: "nota-100", titulo: "Nota 100", descricao: "Treino perfeito.", icone: "star" },
  { id: "sequencia-3", titulo: "3 dias seguidos", descricao: "Treinou 3 dias úteis seguidos.", icone: "flame" },
  { id: "sequencia-5", titulo: "5 dias seguidos", descricao: "Treinou 5 dias úteis seguidos.", icone: "flame" },
  { id: "sequencia-10", titulo: "10 dias seguidos", descricao: "Treinou 10 dias úteis seguidos.", icone: "flame" },
  { id: "todas-faceis", titulo: "Base sólida", descricao: "70+ em todas as missões ★.", icone: "check" },
  { id: "todas-dificeis", titulo: "Mestre", descricao: "70+ em todas as missões ★★★.", icone: "crown" },
  { id: "trilha", titulo: "Trilha concluída", descricao: "70+ em todas as missões da trilha do novo vendedor.", icone: "route" },
  { id: "desafio-vencido", titulo: "Desafio vencido", descricao: "Melhor nota num desafio da semana.", icone: "bolt" },
  { id: "podio", titulo: "Pódio", descricao: "Terminou uma temporada entre os 3 primeiros.", icone: "trophy" },
  { id: "campeao", titulo: "Campeão", descricao: "Venceu uma temporada.", icone: "crown" },
];

/** Melhor nota por missão ("livre" para treino sem missão). */
export function bestScoresByMission(scored: ScoredSession[]): Record<string, number> {
  const best: Record<string, number> = {};
  for (const s of scored) {
    const id = s.missionId || "livre";
    best[id] = Math.max(best[id] ?? 0, s.score as number);
  }
  return best;
}

/** Maior sequência de dias úteis seguidos com treino, em toda a história. */
export function longestStreak(days: string[]): number {
  const set = new Set(days);
  let best = 0;
  for (const day of set) {
    let n = 1;
    for (let d = previousWorkday(day); set.has(d); d = previousWorkday(d)) n++;
    best = Math.max(best, n);
  }
  return best;
}

const allAbove = (ids: string[], best: Record<string, number>) =>
  ids.length > 0 && ids.every((id) => (best[id] ?? -1) >= TRILHA_NOTA_MINIMA);

/** Fim de um mês "YYYY-MM" (último ms em Brasília). */
function seasonEndMs(season: string): number {
  const [y, m] = season.split("-").map(Number);
  return Date.UTC(y, m, 1) + 3 * 60 * 60 * 1000 - 1;
}

/** Vencedor de cada desafio de semana já encerrada: melhor nota na missão da semana (empate: quem fez antes). */
export function challengeWinners(all: TrainingSessionLite[], nowMs: number): Map<string, string> {
  const winners = new Map<string, string>(); // semana → userId
  const scored = new Map<string, ScoredSession[]>();
  for (const userId of new Set(all.map((s) => s.userId))) {
    scored.set(userId, scoreSessions(all.filter((s) => s.userId === userId)));
  }
  const currentWeek = weeklyChallenge(nowMs).semana;
  const best = new Map<string, { userId: string; score: number; at: string }>();
  for (const [userId, sessions] of scored) {
    for (const s of sessions) {
      const week = weeklyChallenge(Date.parse(s.startedAt));
      if (week.semana === currentWeek || s.missionId !== week.mission.id) continue;
      const cur = best.get(week.semana);
      const score = s.score as number;
      if (!cur || score > cur.score || (score === cur.score && s.startedAt < cur.at)) {
        best.set(week.semana, { userId, score, at: s.startedAt });
      }
    }
  }
  for (const [semana, b] of best) winners.set(semana, b.userId);
  return winners;
}

/**
 * Conquistas de uma pessoa agora. `all` são os treinos de todos (pódio,
 * campeão e desafio comparam com o time); `eligible` são as pessoas que
 * contam no ranking (contas bloqueadas fora).
 */
export function unlockedAchievements(
  userId: string,
  all: TrainingSessionLite[],
  nowMs: number,
  eligible: ReadonlySet<string>,
): Set<string> {
  const mine = scoreSessions(all.filter((s) => s.userId === userId));
  const got = new Set<string>();
  if (mine.length === 0) return got;
  got.add("primeiro-treino");
  const scores = mine.map((s) => s.score as number);
  if (scores.some((n) => n >= 70)) got.add("aprovado");
  if (scores.some((n) => n >= 90)) got.add("excelencia");
  if (scores.some((n) => n >= 100)) got.add("nota-100");

  const streak = longestStreak(mine.map((s) => s.day));
  if (streak >= 3) got.add("sequencia-3");
  if (streak >= 5) got.add("sequencia-5");
  if (streak >= 10) got.add("sequencia-10");

  const best = bestScoresByMission(mine);
  if (allAbove(MISSIONS.filter((m) => m.dificuldade === 1).map((m) => m.id), best)) got.add("todas-faceis");
  if (allAbove(MISSIONS.filter((m) => m.dificuldade === 3).map((m) => m.id), best)) got.add("todas-dificeis");
  if (allAbove(MISSIONS.map((m) => m.id), best)) got.add("trilha");

  if ([...challengeWinners(all.filter((s) => eligible.has(s.userId)), nowMs).values()].includes(userId)) {
    got.add("desafio-vencido");
  }

  // Temporadas já encerradas em que a pessoa treinou.
  const currentSeason = seasonOf(nowMs);
  for (const season of new Set(mine.map((s) => s.season))) {
    if (season >= currentSeason) continue;
    const end = seasonEndMs(season);
    const ranking = seasonRanking(
      [...eligible].map((id) => playerProgress(id, all.filter((s) => s.userId === id), end)),
    );
    const pos = ranking.findIndex((p) => p.userId === userId);
    if (pos >= 0 && pos < 3) got.add("podio");
    if (pos === 0) got.add("campeao");
  }
  return got;
}

/** Ranking do desafio da semana: melhor nota de cada pessoa na missão da semana. */
export function challengeRanking(
  all: TrainingSessionLite[],
  nowMs: number,
  eligible: ReadonlySet<string>,
): Array<{ userId: string; melhorNota: number; tentativas: number }> {
  const { mission, semana } = weeklyChallenge(nowMs);
  const rows = new Map<string, { userId: string; melhorNota: number; tentativas: number; at: string }>();
  for (const userId of eligible) {
    for (const s of scoreSessions(all.filter((x) => x.userId === userId))) {
      if (s.missionId !== mission.id || weeklyChallenge(Date.parse(s.startedAt)).semana !== semana) continue;
      const cur = rows.get(userId) ?? { userId, melhorNota: -1, tentativas: 0, at: s.startedAt };
      cur.tentativas++;
      if ((s.score as number) > cur.melhorNota) {
        cur.melhorNota = s.score as number;
        cur.at = s.startedAt;
      }
      rows.set(userId, cur);
    }
  }
  return [...rows.values()]
    .sort((a, b) => b.melhorNota - a.melhorNota || a.at.localeCompare(b.at))
    .map(({ userId, melhorNota, tentativas }) => ({ userId, melhorNota, tentativas }));
}
