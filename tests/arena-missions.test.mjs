import test from "node:test";
import assert from "node:assert/strict";
import { MISSIONS, missionById, unlockedMissions, weeklyChallenge } from "../lib/sellers-v2/missions.ts";
import {
  ACHIEVEMENTS,
  challengeRanking,
  challengeWinners,
  longestStreak,
  unlockedAchievements,
} from "../lib/sellers-v2/achievements.ts";
import { pickTurnForComparison } from "../lib/sellers-v2/cami-compare-shape.ts";
import { criteriaAverages, reminderMessage } from "../lib/sellers-v2/arena-text.ts";

// Horário de Brasília (UTC-3). 14/10/2026 é quarta-feira.
const brt = (local) => Date.parse(`${local}-03:00`);
const at = (local) => new Date(brt(local)).toISOString();
const s = (userId, local, score, missionId = null, status = "completed") => ({
  userId,
  startedAt: at(local),
  score,
  status,
  missionId,
});

test("catálogo: 10 missões em ordem, ids únicos, preços atuais nas missões", () => {
  assert.equal(MISSIONS.length, 10);
  assert.deepEqual(MISSIONS.map((m) => m.ordem), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(new Set(MISSIONS.map((m) => m.id)).size, 10);
  assert.equal(missionById("concorrencia").dificuldade, 3);
  assert.equal(missionById("nao-existe"), null);
  // A tabela mudou em 29/09: nenhuma missão pode citar os preços antigos.
  for (const m of MISSIONS) assert.doesNotMatch(`${m.cliente} ${m.abertura}`, /67,90/);
});

test("trilha: libera a próxima com 70+; desafio e treino livre sempre liberados", () => {
  const none = unlockedMissions({}, "concorrencia");
  assert.ok(none.has("primeiro-contato"));
  assert.ok(!none.has("duvidas-produto"));
  assert.ok(none.has("concorrencia"));
  assert.ok(none.has("livre"));

  const two = unlockedMissions({ "primeiro-contato": 85, "duvidas-produto": 69 }, null);
  assert.ok(two.has("duvidas-produto"));
  assert.ok(!two.has("doze-pares-caro"));
  assert.ok(unlockedMissions({ "primeiro-contato": 85, "duvidas-produto": 70 }, null).has("doze-pares-caro"));
});

test("desafio da semana: mesma missão de segunda a domingo; muda na segunda; só ★★ e ★★★", () => {
  const wed = weeklyChallenge(brt("2026-10-14T10:00:00"));
  const sun = weeklyChallenge(brt("2026-10-18T23:30:00"));
  const nextMon = weeklyChallenge(brt("2026-10-19T00:10:00"));
  assert.equal(wed.mission.id, sun.mission.id);
  assert.equal(wed.semana, "2026-10-12");
  assert.notEqual(nextMon.mission.id, wed.mission.id);
  assert.equal(wed.terminaEm, brt("2026-10-19T00:00:00"));
  for (let i = 0; i < 20; i++) {
    assert.ok(weeklyChallenge(brt("2026-10-14T10:00:00") + i * 7 * 86400e3).mission.dificuldade >= 2);
  }
});

test("Você × Cami: conversa até a mensagem do cliente que o vendedor respondia", () => {
  const turns = [
    { role: "assistant", content: "Oi, quanto fica?" },
    { role: "user", content: "R$ 59,90" },
    { role: "assistant", content: "Caro. Faz 50?" },
    { role: "user", content: "Faço 54 se fechar hoje" },
  ];
  const cut = pickTurnForComparison(turns, 3);
  assert.equal(cut.cliente, "Caro. Faz 50?");
  assert.equal(cut.vendedor, "Faço 54 se fechar hoje");
  assert.equal(cut.history.length, 3);
  assert.equal(pickTurnForComparison(turns, 2), null); // índice de fala do cliente
  assert.equal(pickTurnForComparison(turns, 0), null);
  assert.equal(pickTurnForComparison(turns, 9), null);
});

test("conquistas: notas, sequência e missões", () => {
  assert.equal(ACHIEVEMENTS.length, 13);
  assert.equal(longestStreak(["2026-10-14", "2026-10-15", "2026-10-16", "2026-10-19", "2026-10-21"]), 4);

  const now = brt("2026-10-21T18:00:00");
  const eligible = new Set(["a"]);
  const sessions = [
    s("a", "2026-10-14T10:00:00", 92, "primeiro-contato"),
    s("a", "2026-10-15T10:00:00", 75, "duvidas-produto"),
    s("a", "2026-10-16T10:00:00", 60),
  ];
  const got = unlockedAchievements("a", sessions, now, eligible);
  for (const id of ["primeiro-treino", "aprovado", "excelencia", "sequencia-3", "todas-faceis"]) assert.ok(got.has(id), id);
  for (const id of ["nota-100", "sequencia-5", "todas-dificeis", "trilha", "podio", "campeao"]) assert.ok(!got.has(id), id);
  assert.equal(unlockedAchievements("b", sessions, now, eligible).size, 0);
});

test("conquistas: pódio e campeão de temporada encerrada; desafio vencido em semana encerrada", () => {
  const desafioOutubro = weeklyChallenge(brt("2026-10-14T10:00:00")).mission.id;
  const sessions = [
    s("a", "2026-10-14T10:00:00", 90, desafioOutubro),
    s("b", "2026-10-14T11:00:00", 80, desafioOutubro),
    s("c", "2026-10-14T12:00:00", 70),
  ];
  const eligible = new Set(["a", "b", "c"]);
  const nov = brt("2026-11-03T10:00:00");
  const a = unlockedAchievements("a", sessions, nov, eligible);
  assert.ok(a.has("campeao") && a.has("podio") && a.has("desafio-vencido"));
  const c = unlockedAchievements("c", sessions, nov, eligible);
  assert.ok(c.has("podio") && !c.has("campeao") && !c.has("desafio-vencido"));
  // Ainda em outubro, nada de temporada encerrada nem semana encerrada.
  const oct = unlockedAchievements("a", sessions, brt("2026-10-15T10:00:00"), eligible);
  assert.ok(!oct.has("campeao") && !oct.has("desafio-vencido"));
  assert.equal(challengeWinners(sessions, nov).get("2026-10-12"), "a");
});

test("ranking do desafio: melhor nota de cada um na missão da semana", () => {
  const now = brt("2026-10-15T18:00:00");
  const desafio = weeklyChallenge(now).mission.id;
  const sessions = [
    s("a", "2026-10-14T10:00:00", 70, desafio),
    s("a", "2026-10-15T10:00:00", 88, desafio),
    s("b", "2026-10-15T11:00:00", 81, desafio),
    s("b", "2026-10-15T12:00:00", 95, "primeiro-contato"),
  ];
  assert.deepEqual(challengeRanking(sessions, now, new Set(["a", "b"])), [
    { userId: "a", melhorNota: 88, tentativas: 2 },
    { userId: "b", melhorNota: 81, tentativas: 1 },
  ]);
});

test("lembrete e pontos fracos", () => {
  assert.match(reminderMessage(4, "Raisa Souza").message, /^Raisa, sua sequência de 4 dias termina hoje/);
  assert.match(reminderMessage(0, "Felipe").message, /^Felipe, ainda dá tempo/);
  const avg = criteriaAverages([
    { evaluation: { report: { notasPorCriterio: { precisaoInformacoes: 20, conducaoProximoPasso: 10 } } } },
    { evaluation: { report: { notasPorCriterio: { precisaoInformacoes: 25, conducaoProximoPasso: 14 } } } },
    { evaluation: null },
  ]);
  assert.equal(avg.find((c) => c.id === "precisaoInformacoes").pct, 90);
  assert.equal(avg.find((c) => c.id === "conducaoProximoPasso").pct, 60);
  assert.equal(avg.find((c) => c.id === "clarezaComunicacao").pct, null);
});
