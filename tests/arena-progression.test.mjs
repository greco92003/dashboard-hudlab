import test from "node:test";
import assert from "node:assert/strict";
import {
  brtDay,
  levelFor,
  playerProgress,
  previousWorkday,
  scoreSessions,
  seasonDaysLeft,
  seasonLabel,
  seasonRanking,
} from "../lib/sellers-v2/progression.ts";
import { isTrainingBlocked } from "../lib/sellers-v2/arena-access.ts";

// Horário de Brasília (UTC-3). 14/10/2026 é quarta-feira.
const brt = (local) => Date.parse(`${local}-03:00`);
const at = (local) => new Date(brt(local)).toISOString();
const s = (local, score, over = {}) => ({ userId: "u1", startedAt: at(local), score, status: "completed", ...over });

test("dia e temporada no horário de Brasília", () => {
  assert.equal(brtDay(brt("2026-10-14T23:30:00")), "2026-10-14");
  assert.equal(brtDay(brt("2026-10-15T00:10:00")), "2026-10-15");
  assert.equal(previousWorkday("2026-10-19"), "2026-10-16"); // segunda → sexta
  assert.equal(previousWorkday("2026-10-15"), "2026-10-14");
});

test("XP: nota + bônus de 90+, primeira vez na missão e sequência", () => {
  const scored = scoreSessions([
    s("2026-10-14T10:00:00", 92), // 1º treino: 92 + 25 (90+) + 20 (primeira vez) = 137
    s("2026-10-14T11:00:00", 70), // mesmo dia: 70
    s("2026-10-15T10:00:00", 80), // 2º dia seguido: 80 + 10
    s("2026-10-16T10:00:00", 80, { missionId: "desconto" }), // 3º dia + missão nova: 80 + 20 + 20
  ]);
  assert.deepEqual(scored.map((x) => x.xp), [137, 70, 90, 120]);
});

test("XP: só treino concluído da temporada 1 em diante; do 4º do dia em diante, zero", () => {
  const scored = scoreSessions([
    s("2026-09-01T10:00:00", 90), // antes da temporada 1
    s("2026-10-14T09:00:00", 50, { status: "expired" }),
    s("2026-10-14T10:00:00", 60),
    s("2026-10-14T11:00:00", 60),
    s("2026-10-14T12:00:00", 60),
    s("2026-10-14T13:00:00", 60),
  ]);
  assert.deepEqual(scored.map((x) => x.xp), [80, 60, 60, 0]);
});

test("sequência: fim de semana não quebra; bônus limitado a +50", () => {
  const days = ["2026-10-14", "2026-10-15", "2026-10-16", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22"];
  const scored = scoreSessions(days.map((d) => s(`${d}T10:00:00`, 60)));
  assert.deepEqual(scored.map((x) => x.bonus.sequencia), [0, 10, 20, 30, 40, 50, 50]);

  const p = playerProgress("u1", days.map((d) => s(`${d}T10:00:00`, 60)), brt("2026-10-22T18:00:00"));
  assert.equal(p.streak, 7);
  assert.equal(p.trainedToday, true);
  assert.deepEqual(p.weekDays, [1, 2, 3, 4]);
});

test("sequência viva até o fim do dia e quebrada por um dia útil sem treino", () => {
  const quaQui = [s("2026-10-14T10:00:00", 60), s("2026-10-15T10:00:00", 60)];
  // Sexta de manhã, ainda sem treino: a sequência de 2 continua valendo.
  assert.equal(playerProgress("u1", quaQui, brt("2026-10-16T09:00:00")).streak, 2);
  // Sábado sem ter treinado na sexta: quebrou.
  assert.equal(playerProgress("u1", quaQui, brt("2026-10-17T12:00:00")).streak, 0);

  const quaQuiSex = [...quaQui, s("2026-10-16T10:00:00", 60)];
  // Treinou até sexta: sábado, domingo e segunda de manhã a sequência de 3 segue viva.
  assert.equal(playerProgress("u1", quaQuiSex, brt("2026-10-17T12:00:00")).streak, 3);
  assert.equal(playerProgress("u1", quaQuiSex, brt("2026-10-18T12:00:00")).streak, 3);
  assert.equal(playerProgress("u1", quaQuiSex, brt("2026-10-19T09:00:00")).streak, 3);
  // Segunda inteira sem treino: na terça, quebrou.
  assert.equal(playerProgress("u1", quaQuiSex, brt("2026-10-20T09:00:00")).streak, 0);
});

test("níveis: Aprendiz → Lenda", () => {
  assert.deepEqual(
    [0, 499, 500, 1500, 3500, 7000].map((xp) => levelFor(xp).name),
    ["Aprendiz", "Aprendiz", "Consultor", "Especialista", "Closer", "Lenda"],
  );
  const l = levelFor(1240);
  assert.equal(l.name, "Consultor");
  assert.equal(l.nextName, "Especialista");
  assert.equal(l.progressPct, 74);
  assert.equal(levelFor(9000).progressPct, 100);
  assert.equal(levelFor(9000).nextName, null);
});

test("ranking da temporada: mais XP primeiro; só quem treinou no mês", () => {
  const sessions = [
    s("2026-10-14T10:00:00", 80, { userId: "a" }),
    s("2026-10-14T10:05:00", 95, { userId: "b" }),
    s("2026-10-14T11:00:00", 80, { userId: "c" }),
  ];
  const now = brt("2026-10-14T18:00:00");
  const ranking = seasonRanking(["a", "b", "c", "d"].map((id) => playerProgress(id, sessions, now)));
  assert.deepEqual(ranking.map((p) => p.userId), ["b", "a", "c"]);
  // Novembro: XP de outubro não conta no ranking, mas o nível fica.
  const nov = playerProgress("b", sessions, brt("2026-11-02T10:00:00"));
  assert.equal(nov.seasonXp, 0);
  assert.equal(nov.totalXp, 140);
  assert.equal(seasonRanking([nov]).length, 0);
});

test("temporada: número, mês e dias que faltam", () => {
  assert.deepEqual(seasonLabel(brt("2026-10-14T10:00:00")), { numero: 1, mes: "Outubro" });
  assert.deepEqual(seasonLabel(brt("2026-11-03T10:00:00")), { numero: 2, mes: "Novembro" });
  assert.equal(seasonDaysLeft(brt("2026-10-14T10:00:00")), 18);
  assert.equal(seasonDaysLeft(brt("2026-10-31T10:00:00")), 1);
});

test("quem treina: conta do owner e sem perfil ficam bloqueadas", () => {
  assert.equal(isTrainingBlocked({ role: "owner", email: "hud@x.com" }), true);
  assert.equal(isTrainingBlocked(null), true);
  assert.equal(isTrainingBlocked({ role: "user", email: "schay@x.com" }), false);
  assert.equal(isTrainingBlocked({ role: "team-leader", email: null }), false);
});
