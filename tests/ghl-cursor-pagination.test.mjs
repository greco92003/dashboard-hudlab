import assert from "node:assert/strict";
import test from "node:test";
import { collectGhlCursorSnapshot } from "../lib/ghl/cursor-pagination.ts";

function nextUrl(startAfter, startAfterId) {
  return `https://services.leadconnectorhq.com/opportunities/search?startAfter=${startAfter}&startAfterId=${startAfterId}`;
}

test("uses every GHL cursor and returns a complete unique snapshot", async () => {
  const receivedCursors = [];
  const pages = [
    { items: [{ id: "a" }, { id: "b" }], total: 5, nextPageUrl: nextUrl("2", "b") },
    { items: [{ id: "c" }, { id: "d" }], total: 5, nextPageUrl: nextUrl("4", "d") },
    { items: [{ id: "e" }], total: 5, nextPageUrl: null },
  ];

  const snapshot = await collectGhlCursorSnapshot({
    fetchPage: async (cursor) => {
      receivedCursors.push(cursor);
      return pages.shift();
    },
  });

  assert.deepEqual(receivedCursors, [
    null,
    { startAfter: "2", startAfterId: "b" },
    { startAfter: "4", startAfterId: "d" },
  ]);
  assert.deepEqual(snapshot.items.map(({ id }) => id), ["a", "b", "c", "d", "e"]);
  assert.equal(snapshot.expectedTotal, 5);
  assert.equal(snapshot.complete, true);
});

test("rejects an incomplete snapshot before destructive reconciliation", async () => {
  await assert.rejects(
    collectGhlCursorSnapshot({
      fetchPage: async () => ({
        items: [{ id: "a" }],
        total: 2,
        nextPageUrl: null,
      }),
    }),
    /Incomplete GHL snapshot/,
  );
});

test("rejects a repeated cursor instead of looping or deleting rows", async () => {
  await assert.rejects(
    collectGhlCursorSnapshot({
      fetchPage: async () => ({
        items: [{ id: crypto.randomUUID() }],
        total: 3,
        nextPageUrl: nextUrl("same", "same"),
      }),
    }),
    /repeated cursor/,
  );
});

test("deduplicates rows but still requires the provider total to match", async () => {
  let page = 0;
  await assert.rejects(
    collectGhlCursorSnapshot({
      fetchPage: async () => {
        page += 1;
        return page === 1
          ? {
              items: [{ id: "a" }, { id: "b" }],
              total: 3,
              nextPageUrl: nextUrl("2", "b"),
            }
          : { items: [{ id: "b" }], total: 3, nextPageUrl: null };
      },
    }),
    /received 2 unique opportunities, expected 3/,
  );
});
