import assert from "node:assert/strict";
import test from "node:test";
import {
  tinyRateLimitDelay,
  tinySuccessfulWriteDelay,
} from "../lib/tiny/rate-limit.ts";

test("respeita o reset informado pelo Tiny ao receber 429", () => {
  const headers = new Headers({ "X-RateLimit-Reset": "12" });
  assert.equal(tinyRateLimitDelay(headers, 0), 12_000);
});

test("aguarda uma janela segura quando o 429 não informa o reset", () => {
  assert.equal(tinyRateLimitDelay(new Headers(), 0), 10_000);
  assert.equal(tinyRateLimitDelay(new Headers(), 2), 40_000);
});

test("espaça escritas e pausa até o reset quando o limite termina", () => {
  assert.equal(tinySuccessfulWriteDelay(new Headers()), 2_100);
  assert.equal(
    tinySuccessfulWriteDelay(new Headers({
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Reset": "8",
    })),
    8_000,
  );
});
