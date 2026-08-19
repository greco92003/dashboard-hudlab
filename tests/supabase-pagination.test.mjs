import assert from "node:assert/strict";
import test from "node:test";
import { fetchAllSupabaseRows } from "../lib/supabase-pagination.ts";

test("fetchAllSupabaseRows retrieves every page", async () => {
  const source = Array.from({ length: 2029 }, (_, index) => index);
  const calls = [];

  const rows = await fetchAllSupabaseRows(async (from, to) => {
    calls.push([from, to]);
    return { data: source.slice(from, to + 1), error: null };
  }, "test query");

  assert.deepEqual(rows, source);
  assert.deepEqual(calls, [
    [0, 999],
    [1000, 1999],
    [2000, 2999],
  ]);
});

test("fetchAllSupabaseRows reports a later-page failure", async () => {
  await assert.rejects(
    fetchAllSupabaseRows(async (from) => {
      if (from === 0) {
        return { data: Array.from({ length: 1000 }), error: null };
      }
      return { data: null, error: { message: "database unavailable" } };
    }, "deals read failed"),
    /deals read failed: database unavailable/,
  );
});
