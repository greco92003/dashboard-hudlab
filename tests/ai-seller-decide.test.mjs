import test from "node:test";
import assert from "node:assert/strict";
import { decideRun } from "../lib/ghl/ai-seller/decide.ts";

const NOW = Date.parse("2026-09-29T15:00:00.000Z");
const at = (secondsAgo) => new Date(NOW - secondsAgo * 1000).toISOString();
const msg = (id, direction, secondsAgo, extra = {}) => ({
  id,
  direction,
  body: "",
  dateAdded: at(secondsAgo),
  userId: null,
  attachments: [],
  isAutomated: false,
  ...extra,
});
const input = (over = {}) => ({
  now: NOW,
  hasAiTag: true,
  messages: [],
  aiSentMessageIds: new Set(),
  aiSendsLastHour: 0,
  aiFirstRunAt: null,
  ...over,
});

test("sem a tag da IA, pula", () => {
  assert.deepEqual(
    decideRun(input({ hasAiTag: false, messages: [msg("c1", "inbound", 120)] })),
    { kind: "skip", decision: "pulou:sem_tag" },
  );
});

test("mensagem do cliente com menos de 80s espera o agrupamento", () => {
  assert.deepEqual(decideRun(input({ messages: [msg("c1", "inbound", 30)] })), {
    kind: "skip",
    decision: "pulou:agrupando",
  });
});

test("cliente escreveu há 2 minutos e ninguém respondeu: roda", () => {
  assert.deepEqual(decideRun(input({ messages: [msg("c1", "inbound", 120)] })), {
    kind: "run",
  });
});

test("IA já respondeu depois da última mensagem do cliente", () => {
  assert.deepEqual(
    decideRun(
      input({
        messages: [msg("c1", "inbound", 300), msg("a1", "outbound", 200)],
        aiSentMessageIds: new Set(["a1"]),
        aiFirstRunAt: at(210),
      }),
    ),
    { kind: "skip", decision: "pulou:ja_respondido" },
  );
});

test("automação depois do cliente não conta como resposta", () => {
  assert.deepEqual(
    decideRun(
      input({
        messages: [
          msg("c1", "inbound", 300),
          msg("w1", "outbound", 200, { isAutomated: true }),
        ],
      }),
    ),
    { kind: "run" },
  );
});

test("vendedor humano depois da primeira rodada da IA: humano assumiu", () => {
  assert.deepEqual(
    decideRun(
      input({
        messages: [
          msg("c1", "inbound", 600),
          msg("a1", "outbound", 500),
          msg("h1", "outbound", 100),
        ],
        aiSentMessageIds: new Set(["a1"]),
        aiFirstRunAt: at(510),
      }),
    ),
    { kind: "human_took_over" },
  );
});

test("mensagem humana de antes da IA entrar não cala a IA", () => {
  assert.deepEqual(
    decideRun(
      input({
        messages: [msg("h0", "outbound", 5000), msg("c1", "inbound", 120)],
        aiFirstRunAt: at(4000),
      }),
    ),
    { kind: "run" },
  );
});

test("primeira rodada não procura humano no histórico", () => {
  assert.deepEqual(
    decideRun(
      input({
        messages: [msg("h0", "outbound", 3000), msg("c1", "inbound", 120)],
        aiFirstRunAt: null,
      }),
    ),
    { kind: "run" },
  );
});

test("limite de mensagens da IA na última hora", () => {
  assert.deepEqual(
    decideRun(input({ messages: [msg("c1", "inbound", 120)], aiSendsLastHour: 6 })),
    { kind: "limit" },
  );
});

test("sem mensagem do cliente, nada a responder", () => {
  assert.deepEqual(
    decideRun(input({ messages: [msg("w1", "outbound", 100, { isAutomated: true })] })),
    { kind: "skip", decision: "pulou:ja_respondido" },
  );
});
