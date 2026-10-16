import test from "node:test";
import assert from "node:assert/strict";
import { isCamiAdmin } from "../lib/ghl/ai-seller/admin-shape.ts";
import { summarizeConversation } from "../lib/ghl/ai-seller/intel.ts";

test("quem administra a Cami: owner e a conta willianwmw; o resto do time não", () => {
  assert.equal(isCamiAdmin("owner", "hudlab@exemplo.com"), true);
  assert.equal(isCamiAdmin("team-leader", "willianwmw@gmail.com"), true);
  assert.equal(isCamiAdmin("team-leader", " WillianWMW@Gmail.com "), true);
  assert.equal(isCamiAdmin("team-leader", "outra@exemplo.com"), false);
  assert.equal(isCamiAdmin("user", null), false);
  assert.equal(isCamiAdmin(null, undefined), false);
});

test("funil: etapa que não existe no pipeline (renomeada no GHL) não conta como alcançada", () => {
  const base = { runs: [], handoff: null, now: Date.now() };
  const atendimento = { status: "open", won: false, stageRank: 4 };
  // Antes: rank -1 fazia todo mundo "chegar" à Negociação (16 de 16).
  const semEtapa = summarizeConversation({ ...base, opp: atendimento, ranks: { negociacao: -1, prioridade: -1 } });
  assert.equal(semEtapa.reachedNegociacao, false);
  assert.equal(semEtapa.reachedPrioridade, false);
  const normal = summarizeConversation({ ...base, opp: { ...atendimento, stageRank: 5 }, ranks: { negociacao: 5, prioridade: 6 } });
  assert.equal(normal.reachedNegociacao, true);
  assert.equal(normal.reachedPrioridade, false);
  const ganhou = summarizeConversation({ ...base, opp: { status: "won", won: true, stageRank: null }, ranks: { negociacao: -1, prioridade: -1 } });
  assert.equal(ganhou.reachedPrioridade, true);
});
