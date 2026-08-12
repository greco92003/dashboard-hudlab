import { createClient } from "@supabase/supabase-js";
import { getSupabaseSecretKey } from "@/lib/supabase/keys-server";
import { sha256Hex } from "@/lib/security/webhook-verification";

export type WebhookProvider =
  | "nuvemshop"
  | "manychat"
  | "activecampaign"
  | "ghl";

export function buildWebhookIdempotencyKey(
  provider: WebhookProvider,
  explicitKey: string | null | undefined,
  rawBody: string,
): string {
  const normalized = explicitKey?.trim();
  if (normalized) {
    return normalized.length <= 200
      ? normalized
      : `key:${sha256Hex(normalized)}`;
  }
  return `body:${sha256Hex(`${provider}:${rawBody}`)}`;
}

export async function claimWebhookEvent(input: {
  provider: WebhookProvider;
  idempotencyKey: string;
  payloadSha256: string;
  requestTimestamp: Date | null;
}): Promise<{ claimed: true } | { claimed: false; reason: "replay" }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error("Supabase URL is not configured");

  const supabase = createClient(supabaseUrl, getSupabaseSecretKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await supabase.from("webhook_idempotency").insert({
    provider: input.provider,
    idempotency_key: input.idempotencyKey,
    payload_sha256: input.payloadSha256,
    request_timestamp: input.requestTimestamp?.toISOString() ?? null,
  });

  if (!error) return { claimed: true };
  if (error.code === "23505") return { claimed: false, reason: "replay" };

  console.error("Webhook idempotency claim failed", {
    provider: input.provider,
    code: error.code,
  });
  throw new Error("Webhook replay protection is unavailable");
}
