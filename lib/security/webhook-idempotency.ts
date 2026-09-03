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

/**
 * Remove somente a reserva recém-criada quando o processamento falha.
 * Sem isso, a primeira tentativa com erro envenena a chave e toda tentativa
 * posterior do provedor é descartada como replay.
 */
export async function releaseWebhookEvent(input: {
  provider: WebhookProvider;
  idempotencyKey: string;
  payloadSha256: string;
}): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error("Supabase URL is not configured");

  const supabase = createClient(supabaseUrl, getSupabaseSecretKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await supabase
    .from("webhook_idempotency")
    .delete()
    .eq("provider", input.provider)
    .eq("idempotency_key", input.idempotencyKey)
    .eq("payload_sha256", input.payloadSha256);

  if (error) {
    console.error("Webhook idempotency release failed", {
      provider: input.provider,
      code: error.code,
    });
    throw new Error("Webhook replay claim could not be released");
  }
}
