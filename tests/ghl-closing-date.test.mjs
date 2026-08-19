import assert from "node:assert/strict";
import test from "node:test";
import { resolveGhlClosingDate } from "../lib/ghl/closing-date.ts";

test("won uses the real GHL status transition instead of a stale custom date", () => {
  assert.equal(
    resolveGhlClosingDate({
      normalizedStatus: "won",
      statusChangeDate: "2026-07-20",
      customFieldDate: "2025-12-05",
    }),
    "2026-07-20",
  );
});

test("known AC import artifact uses the migrated closing-date field", () => {
  assert.equal(
    resolveGhlClosingDate({
      normalizedStatus: "won",
      statusChangeDate: "2026-08-03",
      customFieldDate: "2025-12-05",
    }),
    "2025-12-05",
  );
});

test("03/08 without a custom closing date keeps the GHL timestamp", () => {
  assert.equal(
    resolveGhlClosingDate({
      normalizedStatus: "won",
      statusChangeDate: "2026-08-03",
      customFieldDate: null,
    }),
    "2026-08-03",
  );
});

test("won falls back to the custom date when the provider timestamp is absent", () => {
  assert.equal(
    resolveGhlClosingDate({
      normalizedStatus: "won",
      statusChangeDate: null,
      customFieldDate: "2026-08-10",
    }),
    "2026-08-10",
  );
});

test("open deals keep their optional forecast/custom closing date", () => {
  assert.equal(
    resolveGhlClosingDate({
      normalizedStatus: "open",
      statusChangeDate: null,
      customFieldDate: "2026-09-01",
    }),
    "2026-09-01",
  );
});
