const FALLBACK_WRITE_INTERVAL_MS = 2_100;
const FALLBACK_RETRY_DELAY_MS = 10_000;
const MAX_RATE_LIMIT_WAIT_MS = 65_000;

function secondsHeaderDelay(value: string | null) {
  if (!value) return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  // The Tiny docs define X-RateLimit-Reset as seconds remaining, but this also
  // tolerates providers that return a Unix timestamp.
  const seconds = parsed > 1_000_000_000
    ? Math.max(0, parsed - Date.now() / 1_000)
    : parsed;
  return Math.ceil(seconds * 1_000);
}

export function tinyRateLimitDelay(
  headers: Pick<Headers, "get">,
  attempt: number,
) {
  const retryAfter = secondsHeaderDelay(headers.get("retry-after"));
  const reset = secondsHeaderDelay(headers.get("x-ratelimit-reset"));
  const fallback = FALLBACK_RETRY_DELAY_MS * 2 ** attempt;
  return Math.min(
    MAX_RATE_LIMIT_WAIT_MS,
    Math.max(retryAfter, reset, fallback),
  );
}

export function tinySuccessfulWriteDelay(headers: Pick<Headers, "get">) {
  const remaining = Number(headers.get("x-ratelimit-remaining"));
  if (Number.isFinite(remaining) && remaining <= 0) {
    return Math.max(
      FALLBACK_WRITE_INTERVAL_MS,
      Math.min(
        MAX_RATE_LIMIT_WAIT_MS,
        secondsHeaderDelay(headers.get("x-ratelimit-reset")),
      ),
    );
  }
  return FALLBACK_WRITE_INTERVAL_MS;
}
