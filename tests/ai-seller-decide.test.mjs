import test from "node:test";
import assert from "node:assert/strict";
import { decideRun, hasUnseenInbound, mustEscalateSwallowedCall } from "../lib/ghl/ai-seller/decide.ts";

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
  aiSentAtRunStart: new Map(),
  aiSendsLastHour: 0,
  aiSessionStartedAt: null,
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
        aiSentAtRunStart: new Map([["a1", at(210)]]),
        aiSessionStartedAt: at(210),
      }),
    ),
    { kind: "skip", decision: "pulou:ja_respondido" },
  );
});

test("resposta de rodada que começou antes da mensagem nova do cliente não a responde", () => {
  // c2 chegou enquanto a rodada de c1 processava; a1 saiu depois de c2, mas
  // a rodada que o enviou não tinha visto c2.
  assert.deepEqual(
    decideRun(
      input({
        messages: [
          msg("c1", "inbound", 400),
          msg("c2", "inbound", 250),
          msg("a1", "outbound", 240),
        ],
        aiSentMessageIds: new Set(["a1"]),
        aiSentAtRunStart: new Map([["a1", at(310)]]),
        aiSessionStartedAt: at(310),
      }),
    ),
    { kind: "run" },
  );
});

test("saída sem userId que não é automação nem da IA não conta como humano", () => {
  // Mensagem enviada pela API (source "app", userId vazio) de outra integração.
  assert.deepEqual(
    decideRun(
      input({
        messages: [
          msg("c1", "inbound", 600),
          msg("a1", "outbound", 500),
          msg("x1", "outbound", 300, { userId: null }),
          msg("c2", "inbound", 120),
        ],
        aiSentMessageIds: new Set(["a1"]),
        aiSentAtRunStart: new Map([["a1", at(510)]]),
        aiSessionStartedAt: at(510),
      }),
    ),
    { kind: "run" },
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
          msg("h1", "outbound", 100, { userId: "XdbufXkZKhQ5YeleSeCw" }),
        ],
        aiSentMessageIds: new Set(["a1"]),
        aiSentAtRunStart: new Map([["a1", at(510)]]),
        aiSessionStartedAt: at(510),
      }),
    ),
    { kind: "human_took_over" },
  );
});

test("mensagem humana de antes da IA entrar não cala a IA", () => {
  assert.deepEqual(
    decideRun(
      input({
        messages: [msg("h0", "outbound", 5000, { userId: "u1" }), msg("c1", "inbound", 120)],
        aiSessionStartedAt: at(4000),
      }),
    ),
    { kind: "run" },
  );
});

test("primeira rodada não procura humano no histórico", () => {
  assert.deepEqual(
    decideRun(
      input({
        messages: [msg("h0", "outbound", 3000, { userId: "u1" }), msg("c1", "inbound", 120)],
        aiSessionStartedAt: null,
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

test("rechecagem antes do envio: só mensagem do cliente fora do retrato conta", () => {
  const seen = new Set(["c1", "a0"]);
  assert.equal(
    hasUnseenInbound([{ id: "c1", direction: "inbound" }, { id: "w9", direction: "outbound" }], seen),
    false,
  );
  assert.equal(
    hasUnseenInbound([{ id: "c1", direction: "inbound" }, { id: "c2", direction: "inbound" }], seen),
    true,
  );
});

test("chamada engolida pela trava: rodada que não respondeu a mensagem nova escala", () => {
  // Rodada longa (>90s): o webhook da mensagem nova chegou com a trava ocupada
  // e virou pulou:em_andamento; ninguém mais vai responder essa mensagem.
  assert.equal(
    mustEscalateSwallowedCall({ decision: "pulou:mensagem_nova", swallowedCall: true, hasUnseenInbound: true }),
    true,
  );
  assert.equal(
    mustEscalateSwallowedCall({ decision: "nao_respondeu", swallowedCall: true, hasUnseenInbound: true }),
    true,
  );
  // Sem chamada engolida, a chamada da mensagem nova ainda vem e responde.
  assert.equal(
    mustEscalateSwallowedCall({ decision: "pulou:mensagem_nova", swallowedCall: false, hasUnseenInbound: true }),
    false,
  );
  // nao_respondeu sem mensagem nova do cliente: nada ficou para trás.
  assert.equal(
    mustEscalateSwallowedCall({ decision: "nao_respondeu", swallowedCall: true, hasUnseenInbound: false }),
    false,
  );
  // Quem respondeu ou escalou já cuidou do cliente.
  for (const decision of ["respondeu", "escalou", "erro"]) {
    assert.equal(
      mustEscalateSwallowedCall({ decision, swallowedCall: true, hasUnseenInbound: true }),
      false,
      decision,
    );
  }
});
