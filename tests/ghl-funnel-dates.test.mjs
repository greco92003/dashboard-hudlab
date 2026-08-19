import test from "node:test";
import assert from "node:assert/strict";
import {
  parseGhlFunnelTimestamp,
  toGhlFunnelIso,
} from "../lib/ghl/funnel-dates.ts";

test("converte closing_date do cache usando o calendario de Sao Paulo", () => {
  assert.equal(
    toGhlFunnelIso("2026-08-17"),
    "2026-08-17T15:00:00.000Z",
  );
});

test("aceita timestamp ISO completo do GHL sem concatenar outro horario", () => {
  assert.equal(
    toGhlFunnelIso("2026-08-17T13:45:20.000Z"),
    "2026-08-17T13:45:20.000Z",
  );
});

test("datas vazias, invalidas ou impossiveis nao lancam Invalid time value", () => {
  for (const value of [null, undefined, "", "not-a-date", "2026-02-30"]) {
    assert.equal(parseGhlFunnelTimestamp(value), null);
    assert.equal(toGhlFunnelIso(value), null);
  }
});
