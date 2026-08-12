import { safeSecretEqual } from "@/lib/security/route-guards";
import {
  firstHeader,
  verifyHmacWebhook,
  type WebhookVerificationError,
} from "@/lib/security/webhook-verification";
import {
  buildWebhookIdempotencyKey,
  claimWebhookEvent,
} from "@/lib/security/webhook-idempotency";
import type { NextRequest } from "next/server";

type JsonRecord = Record<string, unknown>;
type NuvemshopPayload = JsonRecord & {
  store_id: string | number;
  event: string;
};

export type NuvemshopWebhookSecurityResult =
  | {
      isValid: true;
      payload: NuvemshopPayload;
      headers: Record<string, string>;
    }
  | {
      isValid: false;
      payload: null;
      headers: Record<string, string>;
      error: string;
      status: number;
      shouldBlock: true;
    };

function reject(
  error: string,
  status: number,
): NuvemshopWebhookSecurityResult {
  return {
    isValid: false,
    payload: null,
    headers: {},
    error,
    status,
    shouldBlock: true,
  };
}

function verificationStatus(error: WebhookVerificationError): number {
  if (error === "missing_secret") return 503;
  if (error === "body_too_large") return 413;
  if (error === "stale_timestamp") return 409;
  return 401;
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

export async function secureWebhookMiddleware(
  request: NextRequest,
): Promise<NuvemshopWebhookSecurityResult> {
  const rawBody = await request.text();
  if (!rawBody) return reject("Empty payload", 400);

  const signature = firstHeader(request.headers, [
    "x-linkedstore-hmac-sha256",
    "x-nuvemshop-hmac-sha256",
  ]);

  let payload: JsonRecord | null = null;
  try {
    payload = asRecord(JSON.parse(rawBody));
  } catch {
    return reject("Invalid JSON payload", 400);
  }
  if (!payload) return reject("Invalid JSON payload", 400);

  // Nuvemshop signs the exact body but does not provide an event timestamp.
  // On Vercel, the platform ingress timestamp is generated for every request;
  // replay is independently blocked by Nuvemshop's x-notification-id.
  const timestamp = firstHeader(request.headers, [
    "x-nuvemshop-timestamp",
    "x-webhook-timestamp",
    "x-vercel-proxy-signature-ts",
  ]);
  const verification = verifyHmacWebhook({
    rawBody,
    signature,
    secret: process.env.NUVEMSHOP_WEBHOOK_SECRET,
    timestamp,
  });
  if (!verification.ok) {
    return reject(
      `Webhook verification failed: ${verification.error}`,
      verificationStatus(verification.error),
    );
  }

  const expectedStoreId = process.env.NUVEMSHOP_USER_ID;
  const actualStoreId = payload.store_id;
  if (!expectedStoreId) return reject("Store validation is not configured", 503);
  if (
    (typeof actualStoreId !== "string" &&
      typeof actualStoreId !== "number") ||
    !safeSecretEqual(String(actualStoreId), expectedStoreId)
  ) {
    return reject("Invalid store_id", 401);
  }
  if (typeof payload.event !== "string" || !payload.event) {
    return reject("Missing event", 400);
  }

  const notificationId = firstHeader(request.headers, ["x-notification-id"]);
  const idempotencyKey = buildWebhookIdempotencyKey(
    "nuvemshop",
    notificationId,
    rawBody,
  );
  const claim = await claimWebhookEvent({
    provider: "nuvemshop",
    idempotencyKey,
    payloadSha256: verification.payloadSha256,
    requestTimestamp: verification.timestamp,
  });
  if (!claim.claimed) return reject("Replay rejected", 409);

  return {
    isValid: true,
    payload: payload as NuvemshopPayload,
    // Only persist operational metadata. Never store signatures, OIDC tokens,
    // forwarding details, or credential-bearing request headers.
    headers: {
      "content-type": request.headers.get("content-type") || "",
      "x-notification-id": notificationId || idempotencyKey,
    },
  };
}
