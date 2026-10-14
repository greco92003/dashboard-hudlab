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
