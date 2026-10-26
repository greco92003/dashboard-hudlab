import test from "node:test";
import assert from "node:assert/strict";
import {
  isDealEditableColumn,
  parseDealFieldValue,
} from "../lib/ghl/deal-fields.ts";

test("só as colunas mapeadas para o GHL são editáveis", () => {
  assert.equal(isDealEditableColumn("estado"), true);
  assert.equal(isDealEditableColumn("data_embarque"), true);
  assert.equal(isDealEditableColumn("value"), false);
  assert.equal(isDealEditableColumn("constructor"), false);
});

test("estado vira sigla maiúscula e recusa o que não é UF", () => {
  assert.deepEqual(parseDealFieldValue("estado", " mg "), { ok: true, value: "MG" });
  assert.equal(parseDealFieldValue("estado", "Minas").ok, false);
});

test("pares só aceita inteiro positivo que cabe no integer", () => {
  assert.deepEqual(parseDealFieldValue("quantidade-de-pares", "120"), { ok: true, value: 120 });
  assert.equal(parseDealFieldValue("quantidade-de-pares", "0").ok, false);
  assert.equal(parseDealFieldValue("quantidade-de-pares", "12,5").ok, false);
  assert.equal(parseDealFieldValue("quantidade-de-pares", "33343536373839405000").ok, false);
});

test("data de embarque é gravada como dd/mm/aaaa", () => {
  assert.deepEqual(parseDealFieldValue("data_embarque", "2026-10-21"), {
    ok: true,
    value: "21/10/2026",
  });
  assert.deepEqual(parseDealFieldValue("data_embarque", "5/11/2026"), {
    ok: true,
    value: "05/11/2026",
  });
  assert.equal(parseDealFieldValue("data_embarque", "31/02/2026").ok, false);
});

test("texto vazio é recusado e o resto passa aparado", () => {
  assert.equal(parseDealFieldValue("segmento_de_negocio", "   ").ok, false);
  assert.deepEqual(parseDealFieldValue("utm-source", " Indicação "), {
    ok: true,
    value: "Indicação",
  });
});

test("tipo do frete: Condição prevalece; em branco, deduz pelo valor maior que zero", async () => {
  const { tipoDoFrete, FRETE_GRATIS, FRETE_CLIENTE } = await import("../lib/ghl/deal-fields.ts");
  assert.equal(tipoDoFrete(FRETE_CLIENTE, "120", null), "cliente");
  assert.equal(tipoDoFrete(FRETE_GRATIS, null, null), "gratis");
  assert.equal(tipoDoFrete(null, "182.62", null), "gratis");
  assert.equal(tipoDoFrete("", null, "59"), "cliente");
  // Zero não é sinal: a equipe grava R$ 0 no campo de quem não pagou.
  assert.equal(tipoDoFrete(null, "0", "184.77"), "cliente");
  assert.equal(tipoDoFrete(null, "0", "0"), null);
  assert.equal(tipoDoFrete(null, null, null), null);
});

test("frete: opção aceita o rótulo curto e grava o texto exato do GHL", async () => {
  const { FRETE_GRATIS, FRETE_CLIENTE } = await import("../lib/ghl/deal-fields.ts");
  assert.deepEqual(parseDealFieldValue("ghl_condio_de_frete", "Grátis"), { ok: true, value: FRETE_GRATIS });
  assert.deepEqual(parseDealFieldValue("ghl_condio_de_frete", FRETE_CLIENTE), { ok: true, value: FRETE_CLIENTE });
  assert.equal(parseDealFieldValue("ghl_condio_de_frete", "Correios").ok, false);
});

test("valor do frete aceita formato brasileiro e recusa zero", () => {
  assert.deepEqual(parseDealFieldValue("ghl_valor_do_frete_pago_hud_lab", "1.234,56"), { ok: true, value: 1234.56 });
  assert.deepEqual(parseDealFieldValue("ghl_valor_do_frete_pago_hud_lab", "R$ 189,9"), { ok: true, value: 189.9 });
  assert.deepEqual(parseDealFieldValue("ghl_valor_do_frete_pago_cliente", "59.00"), { ok: true, value: 59 });
  assert.equal(parseDealFieldValue("ghl_valor_do_frete_pago_cliente", "0").ok, false);
  assert.equal(parseDealFieldValue("ghl_valor_do_frete_pago_cliente", "abc").ok, false);
});
