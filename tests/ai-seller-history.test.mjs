import test from "node:test";
import assert from "node:assert/strict";
import { summarizeRuns } from "../lib/ghl/ai-seller/history.ts";

const NOW = Date.parse("2026-09-29T15:00:00.000Z");
const at = (minutesAgo) => new Date(NOW - minutesAgo * 60 * 1000).toISOString();
const row = (minutesAgo, decision, extra = {}) => ({
  triggered_at: at(minutesAgo),
  decision,
  escalation_reason: null,
  sent_message_ids: [],
  ...extra,
});

test("sem histórico: sessão ainda não começou", () => {
  const h = summarizeRuns([], NOW);
  assert.equal(h.sessionStartedAt, null);
  assert.equal(h.sendsLastHour, 0);
  assert.equal(h.sentMessageIds.size, 0);
});

test("sem linha que encerra sessão, a sessão começa na primeira rodada", () => {
  const h = summarizeRuns(
    [row(300, "respondeu", { sent_message_ids: ["a1"] }), row(200, "pulou:ja_respondido")],
    NOW,
  );
  assert.equal(h.sessionStartedAt, at(300));
});

test("depois de escalou, a sessão nova começa na primeira rodada seguinte", () => {
  const h = summarizeRuns(
    [
      row(3000, "respondeu", { sent_message_ids: ["a1"] }),
      row(2900, "escalou", { escalation_reason: "pronto_para_pagar", sent_message_ids: ["a2"] }),
      row(100, "respondeu", { sent_message_ids: ["a3"] }),
      row(50, "pulou:ja_respondido"),
    ],
    NOW,
  );
  assert.equal(h.sessionStartedAt, at(100));
});

test("humano_assumiu, pulou:limite e erro escalado encerram a sessão; erro sem escalonamento não", () => {
  for (const ending of [
    row(500, "humano_assumiu"),
    row(500, "pulou:limite", { escalation_reason: "limite_mensagens" }),
    row(500, "erro", { escalation_reason: "falha_tecnica" }),
  ]) {
    const h = summarizeRuns([row(900, "respondeu"), ending, row(40, "respondeu")], NOW);
    assert.equal(h.sessionStartedAt, at(40), ending.decision);
  }
  const h = summarizeRuns(
    [row(900, "respondeu"), row(500, "erro", { error: "trava expirada" }), row(40, "respondeu")],
    NOW,
  );
  assert.equal(h.sessionStartedAt, at(900));
});

test("sessão encerrada e nenhuma rodada depois: sessão nova ainda não começou", () => {
  const h = summarizeRuns([row(900, "respondeu"), row(500, "humano_assumiu")], NOW);
  assert.equal(h.sessionStartedAt, null);
});

test("linha da trava em andamento não conta como rodada da sessão", () => {
  const h = summarizeRuns([row(900, "escalou", { escalation_reason: "outro" }), row(0, "rodando")], NOW);
  assert.equal(h.sessionStartedAt, null);
});

test("ids enviados guardam o início da rodada que os enviou e contam na última hora", () => {
  const h = summarizeRuns(
    [
      row(90, "respondeu", { sent_message_ids: ["a1"] }),
      row(30, "respondeu", { sent_message_ids: ["a2", "a3"] }),
    ],
    NOW,
  );
  assert.deepEqual([...h.sentMessageIds], ["a1", "a2", "a3"]);
  assert.equal(h.sentAtRunStart.get("a1"), at(90));
  assert.equal(h.sentAtRunStart.get("a3"), at(30));
  assert.equal(h.sendsLastHour, 2);
});
