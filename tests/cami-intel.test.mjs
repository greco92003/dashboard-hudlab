import test from "node:test";
import assert from "node:assert/strict";
import {
  computeOverview,
  needsReview,
  periodStart,
  summarizeConversation,
} from "../lib/ghl/ai-seller/intel.ts";
import { businessMinutesBetween } from "../lib/ghl/ai-seller/hours.ts";
import { validateSettingsInput } from "../lib/ghl/ai-seller/settings-shape.ts";

// Horário de Brasília (UTC-3) -> ms. 14/10/2026 é quarta-feira.
const brt = (iso) => Date.parse(`${iso}-03:00`);
const iso = (local) => new Date(brt(local)).toISOString();
const ranks = { negociacao: 3, prioridade: 4 };
const openOpp = { status: "open", won: false, stageRank: 2 };
const run = (over) => ({
  triggered_at: iso("2026-10-14T10:00:00"),
  decision: "respondeu",
  escalation_reason: null,
  sent_message_ids: ["m1"],
  usage: { input_tokens: 10000, output_tokens: 200 },
  client_message_at: iso("2026-10-14T10:00:00"),
  replied_at: iso("2026-10-14T10:00:40"),
  ...over,
});

test("horas úteis: só turnos de segunda a sexta contam", () => {
  // Sexta 17h50 → segunda 8h40: 10 min na sexta + 10 min na segunda.
  assert.equal(businessMinutesBetween(brt("2026-10-16T17:50:00"), brt("2026-10-19T08:40:00")), 20);
  // Almoço não conta: 11h30 → 14h30 = 30 + 30.
  assert.equal(businessMinutesBetween(brt("2026-10-14T11:30:00"), brt("2026-10-14T14:30:00")), 60);
  assert.equal(businessMinutesBetween(brt("2026-10-14T19:00:00"), brt("2026-10-14T22:00:00")), 0);
});

test("conversa: cliente respondeu, Cami respondeu por último e o cliente sumiu há mais de 24h", () => {
  const s = summarizeConversation({
    runs: [run()],
    handoff: null,
    opp: openOpp,
    ranks,
    now: brt("2026-10-15T12:00:00"),
  });
  assert.equal(s.situacao, "esperando_cliente");
  assert.equal(s.clientReplied, true);
  assert.equal(s.replies, 1);
  assert.equal(s.maxResponseMs, 40000);
  assert.deepEqual(s.signals, ["sumiu"]);
  assert.equal(s.reachedNegociacao, false);
});

test("conversa: passagem sem resposta há mais de 1h útil e cliente que pediu pessoa", () => {
  const handoff = { motivo: "cliente_pediu_pessoa", escalated_at: iso("2026-10-14T09:00:00"), answered_at: null };
  const s = summarizeConversation({
    runs: [run({ decision: "escalou" })],
    handoff,
    opp: openOpp,
    ranks,
    now: brt("2026-10-14T10:30:00"),
  });
  assert.equal(s.situacao, "passou");
  assert.deepEqual(s.signals, ["pediu_pessoa_ou_reclamou", "passagem_sem_resposta"]);

  const answered = summarizeConversation({
    runs: [run({ decision: "escalou" })],
    handoff: { ...handoff, answered_at: iso("2026-10-14T09:20:00") },
    opp: openOpp,
    ranks,
    now: brt("2026-10-14T10:30:00"),
  });
  assert.deepEqual(answered.signals, ["pediu_pessoa_ou_reclamou"]);
});

test("conversa: resposta lenta, falha, venda e etapa alcançada", () => {
  const slow = summarizeConversation({
    runs: [run({ replied_at: iso("2026-10-14T10:03:00") }), run({ decision: "erro", escalation_reason: "falha_tecnica" })],
    handoff: null,
    opp: { status: "open", won: false, stageRank: 4 },
    ranks,
    now: brt("2026-10-14T10:05:00"),
  });
  assert.ok(slow.signals.includes("resposta_lenta"));
  assert.ok(slow.signals.includes("falha"));
  assert.equal(slow.reachedNegociacao, true);
  assert.equal(slow.reachedPrioridade, true);

  const won = summarizeConversation({ runs: [], handoff: null, opp: { status: "won", won: true, stageRank: null }, ranks, now: Date.now() });
  assert.equal(won.situacao, "ganhou");
  assert.equal(won.clientReplied, false);
  assert.equal(won.reachedNegociacao, true);

  const lost = summarizeConversation({ runs: [], handoff: null, opp: { status: "lost", won: false, stageRank: 1 }, ranks, now: Date.now() });
  assert.equal(lost.situacao, "perdeu");
});

test("revisado: some da lista até surgir sinal novo", () => {
  assert.equal(needsReview(["sumiu"], []), true);
  assert.equal(needsReview(["sumiu"], ["sumiu"]), false);
  assert.equal(needsReview(["sumiu", "falha"], ["sumiu"]), true);
  assert.equal(needsReview([], []), false);
});

test("período: hoje começa à meia-noite de Brasília", () => {
  const now = brt("2026-10-14T01:30:00");
  assert.equal(periodStart("hoje", now), brt("2026-10-14T00:00:00"));
  assert.equal(periodStart("tudo", now), null);
  assert.equal(periodStart("7d", now), now - 7 * 86400e3);
});

test("visão geral sem dados: zeros e porcentagens vazias", () => {
  const o = computeOverview({
    fromMs: null,
    assignments: [],
    conversations: [],
    runs: [],
    handoffs: [],
    custo: { entradaUsdPorMilhao: 2.5, saidaUsdPorMilhao: 15, dolar: 5.4 },
  });
  assert.equal(o.assumidos, 0);
  assert.equal(o.responderam.pct, null);
  assert.equal(o.tempoResposta.medianaSeg, null);
  assert.equal(o.custo.reais, 0);
  assert.equal(o.custo.porVendaReais, null);
  assert.ok(o.funil.every((f) => f.n === 0 && f.pct === null));
});

test("visão geral: coorte do período, funil, tempos e custo", () => {
  const conv = (over) => ({
    assigned_at: iso("2026-10-14T09:00:00"),
    situacao: "atendendo",
    client_replied: true,
    reached_negociacao: false,
    reached_prioridade: false,
    handoff_motivo: null,
    monetary_value: 718.8,
    signals: [],
    ...over,
  });
  const o = computeOverview({
    fromMs: brt("2026-10-14T00:00:00"),
    assignments: [
      { created_at: iso("2026-10-14T09:00:00"), decisao: "assumiu" },
      { created_at: iso("2026-10-14T09:10:00"), decisao: "fora_da_faixa_de_pares" },
      { created_at: iso("2026-10-14T09:20:00"), decisao: "time_ja_conversando" },
      { created_at: iso("2026-10-13T09:00:00"), decisao: "fora_da_faixa_de_pares" },
    ],
    conversations: [
      conv({ situacao: "ganhou", reached_negociacao: true, reached_prioridade: true, handoff_motivo: "pronto_para_pagar" }),
      conv({ client_replied: false, signals: ["sumiu"] }),
      conv({ reached_negociacao: true }),
      conv({ assigned_at: iso("2026-10-13T09:00:00") }),
    ],
    runs: [
      { triggered_at: iso("2026-10-14T10:00:00"), usage: { input_tokens: 1_000_000, output_tokens: 0 }, client_message_at: iso("2026-10-14T10:00:00"), replied_at: iso("2026-10-14T10:00:30") },
      { triggered_at: iso("2026-10-14T11:00:00"), usage: null, client_message_at: iso("2026-10-14T11:00:00"), replied_at: iso("2026-10-14T11:01:30") },
    ],
    handoffs: [{ motivo: "pronto_para_pagar", escalated_at: iso("2026-10-14T12:00:00") }],
    custo: { entradaUsdPorMilhao: 2, saidaUsdPorMilhao: 10, dolar: 5 },
  });
  assert.equal(o.assumidos, 3);
  assert.deepEqual(o.foraDaCami, [
    { motivo: "fora_da_faixa_de_pares", n: 1 },
    { motivo: "time_ja_conversando", n: 1 },
  ]);
  assert.equal(o.responderam.n, 2);
  assert.equal(Math.round(o.responderam.pct), 67);
  assert.equal(o.tempoResposta.medianaSeg, 60);
  assert.equal(o.tempoResposta.piorSeg, 90);
  assert.equal(o.pagamento.n, 1);
  assert.equal(o.sumiram.n, 1);
  assert.deepEqual(o.vendas, { n: 1, valor: 718.8 });
  assert.equal(o.custo.reais, 10);
  assert.equal(o.custo.porVendaReais, 10);
  assert.deepEqual(o.funil.map((f) => f.n), [3, 2, 2, 1, 1, 1]);
});

test("Controle: salvar recusa valor inválido com o motivo", () => {
  const ok = {
    estado: "ligada",
    minPares: 12,
    maxPares: 23,
    escalationUserId: "u1",
    escalationName: "Schay",
    shifts: [["08:30", "12:00"]],
    custo: { entradaUsdPorMilhao: 2.5, saidaUsdPorMilhao: 15, dolar: 5.4 },
  };
  const v = validateSettingsInput(ok);
  assert.equal(v.ok, true);
  assert.equal(v.row.max_pares, 23);
  assert.match(validateSettingsInput({ ...ok, minPares: 10 }).error, /mínimo é 12/);
  assert.match(validateSettingsInput({ ...ok, maxPares: 11 }).error, /máximo não pode ser menor/);
  assert.match(validateSettingsInput({ ...ok, estado: "talvez" }).error, /Estado/);
  assert.match(validateSettingsInput({ ...ok, escalationName: " " }).error, /nome/);
  assert.match(validateSettingsInput({ ...ok, shifts: [["12:00", "08:00"]] }).error, /Turnos/);
  assert.match(validateSettingsInput({ ...ok, custo: { ...ok.custo, dolar: 0 } }).error, /dólar/);
});
