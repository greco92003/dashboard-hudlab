import test from "node:test";
import assert from "node:assert/strict";
import { hasOfficialMockupTag } from "../lib/live-dashboard-forecast.ts";

test("aceita a tag Solicitou Mockup Oficial independentemente de caixa e acento", () => {
  assert.equal(
    hasOfficialMockupTag({ tags: ["Lead", "Solicitou Mockup Oficial"] }),
    true,
  );
  assert.equal(
    hasOfficialMockupTag({ tags: ["solicitou mockup oficial"] }),
    true,
  );
});

test("aceita tags serializadas pelo GHL como texto separado por vírgula", () => {
  assert.equal(
    hasOfficialMockupTag({ tags: "Lead, Solicitou Mockup Oficial" }),
    true,
  );
});

test("rejeita contato sem a tag oficial", () => {
  assert.equal(hasOfficialMockupTag({ tags: ["Solicitou Orçamento"] }), false);
  assert.equal(hasOfficialMockupTag({}), false);
  assert.equal(hasOfficialMockupTag(null), false);
});