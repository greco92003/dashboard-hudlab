import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConversationView,
  nextReviewLabel,
  validateFeedbackInput,
} from "../lib/ghl/ai-seller/feedback-shape.ts";
import { buildSellerInstructions } from "../lib/ghl/ai-seller/prompt.ts";

// Horário de Brasília (UTC-3). 16/10/2026 é sexta-feira.
const brt = (local) => Date.parse(`${local}-03:00`);

test("feedback: texto ou atalho; atalhos e mensagens filtrados", () => {
  assert.equal(validateFeedbackInput({ texto: "  " }).ok, false);
  assert.match(validateFeedbackInput({ texto: "" }).error, /atalho/);
  assert.equal(validateFeedbackInput({ texto: "x".repeat(2001) }).ok, false);

  const so = validateFeedbackInput({ atalhos: ["foi_otimo", "inventado", "foi_otimo"] });
  assert.equal(so.ok, true);
  assert.deepEqual(so.value.atalhos, ["foi_otimo"]);

  const full = validateFeedbackInput({
    texto: " Foi redundante ",
    atalhos: ["redundante"],
    mensagens: ["m1", "m1", 3, ""],
    urgente: true,
  });
  assert.deepEqual(full.value, { texto: "Foi redundante", atalhos: ["redundante"], mensagens: ["m1"], urgente: true });
  assert.equal(validateFeedbackInput({ texto: "ok ok", urgente: "sim" }).value.urgente, false);
});

const msg = (id, over) => ({
  id,
  direction: "outbound",
  body: id,
  dateAdded: "2026-10-14T22:00:00Z",
  userId: null,
  attachments: [],
  isAutomated: false,
  ...over,
});

test("conversa na tela: quem falou e robô recolhido a partir de 3 seguidas", () => {
  const view = buildConversationView(
    [
      msg("r1", { isAutomated: true }),
      msg("r2", { isAutomated: true }),
      msg("r3", { isAutomated: true }),
      msg("c1", { direction: "inbound" }),
      msg("cami1", { userId: "u-api" }),
      msg("t1", { userId: "u-schay" }),
      msg("r4", { isAutomated: true }),
    ],
    new Set(["cami1"]),
  );
  assert.equal(view[0].tipo, "robo");
  assert.equal(view[0].mensagens.length, 3);
  assert.deepEqual(
    view.slice(1).map((v) => `${v.mensagem.id}:${v.mensagem.quem}`),
    ["c1:cliente", "cami1:cami", "t1:time", "r4:robo"],
  );
});

test("próxima revisão: segunda às 8h30", () => {
  assert.equal(nextReviewLabel(brt("2026-10-16T15:00:00")), "19/10"); // sexta
  assert.equal(nextReviewLabel(brt("2026-10-18T23:00:00")), "19/10"); // domingo
  assert.equal(nextReviewLabel(brt("2026-10-19T08:00:00")), "19/10"); // segunda antes das 8h30
  assert.equal(nextReviewLabel(brt("2026-10-19T09:00:00")), "26/10"); // segunda depois
});

test("jeito de atender: não se repetir é base, não regra", () => {
  const text = buildSellerInstructions({ persona: "Cami", escalationName: "Schay" });
  assert.match(text, /Não se repita/);
  assert.match(text, /no tamanho do que o cliente disse/);
  assert.doesNotMatch(text, /REGRAS DA CASA/);
});
