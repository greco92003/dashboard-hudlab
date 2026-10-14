import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ACTIVE_RULES,
  canActivateRule,
  cutReferenceSnapshot,
  parseGhlContactId,
  rulesSection,
  validateRuleText,
} from "../lib/ghl/ai-seller/rules-shape.ts";
import { buildSellerInstructions } from "../lib/ghl/ai-seller/prompt.ts";

const msg = (id, direction, body = "") => ({
  id,
  direction,
  body,
  dateAdded: `2026-10-15T1${id.length}:00:00.000Z`,
  userId: null,
  attachments: [],
  isAutomated: false,
});

test("texto da regra: limpa espaços e recusa curto ou longo demais", () => {
  assert.deepEqual(validateRuleText("  Pergunte   a data do evento.  "), { ok: true, texto: "Pergunte a data do evento." });
  assert.equal(validateRuleText("oi").ok, false);
  assert.equal(validateRuleText(null).ok, false);
  assert.equal(validateRuleText("x".repeat(601)).ok, false);
});

test("no máximo 15 regras ligadas", () => {
  assert.equal(MAX_ACTIVE_RULES, 15);
  assert.equal(canActivateRule(14), true);
  assert.equal(canActivateRule(15), false);
});

test("regras entram nas instruções da Cami acima do manual", () => {
  assert.equal(rulesSection([]), "");
  const section = rulesSection(["Pergunte a data do evento.", "Fale do PIX."]);
  assert.match(section, /1\. Pergunte a data do evento\.\n2\. Fale do PIX\./);

  const withRules = buildSellerInstructions({ persona: "Cami", escalationName: "Schay", rules: ["Fale do PIX."] });
  assert.match(withRules, /REGRAS DA CASA/);
  assert.ok(withRules.indexOf("REGRAS DA CASA") < withRules.indexOf("MANUAL COMERCIAL HUD LAB"));
  const without = buildSellerInstructions({ persona: "Cami", escalationName: "Schay" });
  assert.doesNotMatch(without, /REGRAS DA CASA/);
});

test("foto da referência vai até a última mensagem do cliente e marca as da IA", () => {
  const messages = [msg("c1", "inbound", "oi"), msg("a1", "outbound", "Olá!"), msg("c2", "inbound", "quanto fica?"), msg("a2", "outbound", "R$ 59,90")];
  const snap = cutReferenceSnapshot(messages, new Set(["a1", "a2"]));
  assert.deepEqual(snap.map((m) => m.id), ["c1", "a1", "c2"]);
  assert.deepEqual(snap.map((m) => m.own), [false, true, false]);
  // Até uma mensagem escolhida do cliente.
  assert.deepEqual(cutReferenceSnapshot(messages, new Set(), "c1").map((m) => m.id), ["c1"]);
  // Cliente nunca escreveu: sem referência.
  assert.equal(cutReferenceSnapshot([msg("a1", "outbound", "Olá!")], new Set()), null);
});

test("contato: aceita o ID ou o link do GHL", () => {
  assert.equal(parseGhlContactId("abcContato1234567890"), "abcContato1234567890");
  assert.equal(
    parseGhlContactId("https://app.gohighlevel.com/v2/location/dhz2q752HHI3xw2jHkrv/contacts/detail/abcContato1234567890?tab=x"),
    "abcContato1234567890",
  );
  assert.equal(parseGhlContactId("https://google.com"), null);
  assert.equal(parseGhlContactId(""), null);
  assert.equal(parseGhlContactId(42), null);
});
