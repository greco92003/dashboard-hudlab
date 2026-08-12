import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  validateOptionalWebhookTimestamp,
  verifyHmacWebhook,
} from "../lib/security/webhook-verification.ts";
import {
  createTinyOAuthFlow,
  verifyTinyOAuthState,
} from "../lib/tiny/oauth-security.ts";

const secret = "test-only-webhook-secret-with-sufficient-entropy";
const now = Date.parse("2026-07-21T20:00:00.000Z");
const timestamp = new Date(now).toISOString();
const rawBody = JSON.stringify({ event: "deal_update", timestamp, id: "42" });
const signature = createHmac("sha256", secret)
  .update(rawBody, "utf8")
  .digest("hex");

test("accepts a valid signature over the exact raw body", () => {
  const result = verifyHmacWebhook({
    rawBody,
    signature,
    secret,
    timestamp,
    nowMs: now,
  });
  assert.equal(result.ok, true);
});

test("rejects a modified payload before any persistence step", () => {
  const result = verifyHmacWebhook({
    rawBody: rawBody.replace("42", "43"),
    signature,
    secret,
    timestamp,
    nowMs: now,
  });
  assert.deepEqual(result, { ok: false, error: "invalid_signature" });
});

test("fails closed when the webhook secret is absent", () => {
  const result = verifyHmacWebhook({
    rawBody,
    signature,
    secret: undefined,
    timestamp,
    nowMs: now,
  });
  assert.deepEqual(result, { ok: false, error: "missing_secret" });
});

test("rejects a stale signed webhook", () => {
  const result = verifyHmacWebhook({
    rawBody,
    signature,
    secret,
    timestamp,
    nowMs: now + 11 * 60 * 1000,
  });
  assert.deepEqual(result, { ok: false, error: "stale_timestamp" });
});

test("accepts a GHL funnel webhook without timestamp during migration", () => {
  assert.deepEqual(validateOptionalWebhookTimestamp(undefined), {
    ok: true,
    timestamp: null,
  });
});

test("validates a GHL funnel timestamp when supplied", () => {
  const nowMs = Date.parse("2026-08-12T12:00:00.000Z");
  const valid = validateOptionalWebhookTimestamp(
    "2026-08-12T11:59:00.000Z",
    nowMs,
  );
  assert.equal(valid.ok, true);
  assert.deepEqual(validateOptionalWebhookTimestamp("not-a-date", nowMs), {
    ok: false,
    error: "invalid_timestamp",
  });
  assert.deepEqual(
    validateOptionalWebhookTimestamp("2026-08-12T10:00:00.000Z", nowMs),
    { ok: false, error: "stale_timestamp" },
  );
});

test("binds Tiny OAuth state to user, nonce and expiration", () => {
  process.env.TINY_OAUTH_STATE_SECRET =
    "test-only-oauth-state-secret-with-sufficient-entropy";
  const flow = createTinyOAuthFlow("admin-user");

  assert.equal(
    verifyTinyOAuthState({
      state: flow.state,
      expectedUserId: "admin-user",
      expectedNonce: flow.nonce,
    }),
    true,
  );
  assert.equal(
    verifyTinyOAuthState({
      state: flow.state,
      expectedUserId: "different-user",
      expectedNonce: flow.nonce,
    }),
    false,
  );
  assert.equal(
    verifyTinyOAuthState({
      state: flow.state,
      expectedUserId: "admin-user",
      expectedNonce: "wrong-nonce",
    }),
    false,
  );
});

test("rejects tampered Tiny OAuth state", () => {
  process.env.TINY_OAUTH_STATE_SECRET =
    "test-only-oauth-state-secret-with-sufficient-entropy";
  const flow = createTinyOAuthFlow("admin-user");
  const tampered = `${flow.state.slice(0, -1)}${flow.state.endsWith("a") ? "b" : "a"}`;
  assert.equal(
    verifyTinyOAuthState({
      state: tampered,
      expectedUserId: "admin-user",
      expectedNonce: flow.nonce,
    }),
    false,
  );
});

test("rejects expired Tiny OAuth state", () => {
  process.env.TINY_OAUTH_STATE_SECRET =
    "test-only-oauth-state-secret-with-sufficient-entropy";
  const flow = createTinyOAuthFlow("admin-user");
  assert.equal(
    verifyTinyOAuthState({
      state: flow.state,
      expectedUserId: "admin-user",
      expectedNonce: flow.nonce,
      nowMs: Date.now() + 11 * 60 * 1000,
    }),
    false,
  );
});
