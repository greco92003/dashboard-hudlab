import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const WEBHOOK_MAX_BODY_BYTES = 1_000_000;
export const WEBHOOK_MAX_AGE_MS = 10 * 60 * 1000;

export type WebhookVerificationError =
  | "missing_secret"
  | "missing_signature"
  | "invalid_signature"
  | "missing_timestamp"
  | "invalid_timestamp"
  | "stale_timestamp"
  | "body_too_large";

export type WebhookVerificationResult =
  | { ok: true; timestamp: Date | null; payloadSha256: string }
  | { ok: false; error: WebhookVerificationError };

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function createWebhookNonce(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function verifyHmacSha256(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): boolean {
  const signature = signatureHeader.trim().replace(/^sha256=/i, "");
  const hmac = createHmac("sha256", secret).update(rawBody, "utf8");
  const expectedHex = hmac.digest("hex");

  if (/^[0-9a-f]{64}$/i.test(signature)) {
    return safeEqual(signature.toLowerCase(), expectedHex);
  }

  const expectedBase64 = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");
  return safeEqual(signature, expectedBase64);
}

export function parseWebhookTimestamp(value: unknown): Date | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value < 10_000_000_000 ? value * 1000 : value;
    const parsed = new Date(milliseconds);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    return parseWebhookTimestamp(Number(trimmed));
  }

  const milliseconds = Date.parse(trimmed);
  return Number.isNaN(milliseconds) ? null : new Date(milliseconds);
}

export function validateOptionalWebhookTimestamp(
  value: unknown,
  nowMs = Date.now(),
  maxAgeMs = WEBHOOK_MAX_AGE_MS,
):
  | { ok: true; timestamp: Date | null }
  | { ok: false; error: "invalid_timestamp" | "stale_timestamp" } {
  if (value == null) return { ok: true, timestamp: null };

  const timestamp = parseWebhookTimestamp(value);
  if (!timestamp) return { ok: false, error: "invalid_timestamp" };
  if (Math.abs(nowMs - timestamp.getTime()) > maxAgeMs) {
    return { ok: false, error: "stale_timestamp" };
  }
  return { ok: true, timestamp };
}

export function verifyHmacWebhook(input: {
  rawBody: string;
  signature: string | null;
  secret: string | undefined;
  timestamp?: unknown;
  requireTimestamp?: boolean;
  nowMs?: number;
  maxAgeMs?: number;
}): WebhookVerificationResult {
  const {
    rawBody,
    signature,
    secret,
    timestamp,
    requireTimestamp = true,
    nowMs = Date.now(),
    maxAgeMs = WEBHOOK_MAX_AGE_MS,
  } = input;

  if (!secret) return { ok: false, error: "missing_secret" };
  if (Buffer.byteLength(rawBody, "utf8") > WEBHOOK_MAX_BODY_BYTES) {
    return { ok: false, error: "body_too_large" };
  }
  if (!signature) return { ok: false, error: "missing_signature" };
  if (!verifyHmacSha256(rawBody, signature, secret)) {
    return { ok: false, error: "invalid_signature" };
  }

  const parsedTimestamp = parseWebhookTimestamp(timestamp);
  if (requireTimestamp && timestamp == null) {
    return { ok: false, error: "missing_timestamp" };
  }
  if (timestamp != null && !parsedTimestamp) {
    return { ok: false, error: "invalid_timestamp" };
  }
  if (
    parsedTimestamp &&
    Math.abs(nowMs - parsedTimestamp.getTime()) > maxAgeMs
  ) {
    return { ok: false, error: "stale_timestamp" };
  }

  return {
    ok: true,
    timestamp: parsedTimestamp,
    payloadSha256: sha256Hex(rawBody),
  };
}

export function firstHeader(
  headers: Headers,
  names: readonly string[],
): string | null {
  for (const name of names) {
    const value = headers.get(name);
    if (value) return value;
  }
  return null;
}
