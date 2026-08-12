import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getGhlDeal } from "@/lib/ghl/api";
import { upsertGhlDeals } from "@/lib/ghl/deals-cache";
import { verifyGhlWebhook } from "@/lib/ghl/webhook";
import { getSupabaseSecretKey } from "@/lib/supabase/keys-server";
import {
  buildWebhookIdempotencyKey,
  claimWebhookEvent,
} from "@/lib/security/webhook-idempotency";
import {
  sha256Hex,
  WEBHOOK_MAX_BODY_BYTES,
} from "@/lib/security/webhook-verification";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!rawBody || Buffer.byteLength(rawBody, "utf8") > WEBHOOK_MAX_BODY_BYTES) {
    return NextResponse.json({ success: false, error: "Invalid body" }, { status: 400 });
  }
  if (!verifyGhlWebhook(rawBody, request.headers)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  let payload: JsonRecord;
  try {
    payload = record(JSON.parse(rawBody));
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const opportunity = record(payload.opportunity);
  const customData = record(payload.customData);
  const eventType = firstString(payload.type, payload.event, customData.event) || "OpportunityUpdate";
  const opportunityId = firstString(
    payload.id,
    payload.opportunityId,
    opportunity.id,
    customData.opportunity_id,
    customData.deal_id,
  );
  if (!opportunityId) {
    return NextResponse.json({ success: false, error: "Missing opportunity id" }, { status: 422 });
  }

  const locationId = firstString(payload.locationId, payload.location_id, customData.location_id);
  if (locationId && locationId !== process.env.GHL_LOCATION_ID) {
    return NextResponse.json({ success: false, error: "Wrong location" }, { status: 403 });
  }

  const webhookId = firstString(payload.webhookId, payload.eventId);
  const claim = await claimWebhookEvent({
    provider: "ghl",
    idempotencyKey: buildWebhookIdempotencyKey("ghl", webhookId, rawBody),
    payloadSha256: sha256Hex(rawBody),
    requestTimestamp: null,
  });
  if (!claim.claimed) {
    return NextResponse.json({ success: true, duplicate: true });
  }

  const requestId = request.headers.get("x-vercel-id") || webhookId || crypto.randomUUID();
  try {
    if (eventType.toLowerCase().includes("delete")) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!url) throw new Error("Supabase URL is not configured");
      const supabase = createClient(url, getSupabaseSecretKey(), {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { error } = await supabase
        .from("deals_cache")
        .delete()
        .eq("source_system", "ghl")
        .eq("deal_id", opportunityId);
      if (error) throw error;
      return NextResponse.json({ success: true, deleted: opportunityId });
    }

    const deal = await getGhlDeal(opportunityId);
    await upsertGhlDeals([deal], "webhook", requestId);
    return NextResponse.json({ success: true, updated: opportunityId });
  } catch (error) {
    console.error("GHL deal webhook processing failed", error);
    // GHL retries non-2xx responses with exponential backoff.
    return NextResponse.json({ success: false, error: "Processing failed" }, { status: 500 });
  }
}

export const runtime = "nodejs";
export const maxDuration = 60;
