import "server-only";

import { verify } from "node:crypto";
import { safeSecretEqual } from "@/lib/security/route-guards";

const GHL_ED25519_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=
-----END PUBLIC KEY-----`;

export function verifyGhlWebhook(rawBody: string, headers: Headers): boolean {
  const ghlSignature = headers.get("x-ghl-signature");
  if (ghlSignature) {
    try {
      return verify(
        null,
        Buffer.from(rawBody, "utf8"),
        GHL_ED25519_PUBLIC_KEY,
        Buffer.from(ghlSignature, "base64"),
      );
    } catch {
      return false;
    }
  }

  // Private Integration Tokens cannot subscribe to native app webhooks. This
  // fallback supports a GHL Workflow custom webhook protected by a bearer key.
  const secret = process.env.GHL_WEBHOOK_SECRET;
  const authorization = headers.get("authorization") || "";
  if (!secret || !authorization.startsWith("Bearer ")) return false;
  return safeSecretEqual(authorization.slice(7), secret);
}
