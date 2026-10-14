import test from "node:test";
import assert from "node:assert/strict";
import { trimForSeller } from "../lib/ghl/ai-seller/transcript.ts";

const msg = (id, direction, body = "", extra = {}) => ({
  id,
  direction,
  body,
  dateAdded: "2026-10-14T12:00:00.000Z",
  userId: null,
  attachments: [],
  isAutomated: false,
  ...extra,
});
const robot = (id, body, attachments = []) => msg(id, "outbound", body, { isAutomated: true, attachments });

test("tira o robô antes da entrega da amostra e mantém o cliente", () => {
  const messages = [
    msg("c1", "inbound", "quero chinelos pro evento dia 20"),
    robot("r1", "Veja alguns modelos", ["https://x/exemplo1.jpg", "https://x/exemplo2.jpg"]),
    robot("r2", "Agora, para o designer criar sua Amostra Digital, bora?"),
    msg("c2", "inbound", "30 pares"),
    robot("r3", "Suas amostras digitais ficaram prontas!", ["https://x/mock.png"]),
    msg("c3", "inbound", "gostei"),
    msg("a1", "outbound", "Que bom!"),
  ];
  const trimmed = trimForSeller(messages);
  assert.deepEqual(trimmed.messages.map((m) => m.id), ["c1", "c2", "r3", "c3", "a1"]);
  assert.equal(trimmed.omittedAutomated, 2);
});

test("mensagem de alguém do time antes da amostra fica", () => {
  const messages = [
    msg("v1", "outbound", "Oi, aqui é a Schay", { userId: "u1" }),
    robot("r1", "Suas amostras digitais ficaram prontas!"),
  ];
  assert.deepEqual(trimForSeller(messages).messages.map((m) => m.id), ["v1", "r1"]);
});

test("sem entrega de amostra, nada sai", () => {
  const messages = [msg("c1", "inbound", "oi"), robot("r1", "Veja alguns modelos")];
  const trimmed = trimForSeller(messages);
  assert.equal(trimmed.messages.length, 2);
  assert.equal(trimmed.omittedAutomated, 0);
});

test("corta na última entrega: automações depois dela ficam", () => {
  const messages = [
    robot("r1", "Suas amostras digitais ficaram prontas!"),
    robot("p1", "Promoção da semana"),
    robot("r2", "Sua Amostra Digital ajustada ficou pronta!"),
    robot("p2", "Lembrete"),
  ];
  assert.deepEqual(trimForSeller(messages).messages.map((m) => m.id), ["r2", "p2"]);
});
