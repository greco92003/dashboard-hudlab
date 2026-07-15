import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  GHL_FUNNEL_STAGES,
  normalizeGhlFunnelStage,
} from "@/lib/ghl/funnel";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.GHL_WEBHOOK_SECRET;
  if (!secret) return false;

  const actual = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function parseTags(value: unknown): string[] {
  const tags = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return Array.from(
    new Set(
      tags
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string" || !value.trim()) return null;

  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

export async function POST(request: NextRequest) {
  if (!process.env.GHL_WEBHOOK_SECRET) {
    console.error("[GHL Funnel] GHL_WEBHOOK_SECRET is not configured");
    return NextResponse.json(
      { received: false, error: "Webhook receiver is not configured" },
      { status: 503 },
    );
  }

  if (!isAuthorized(request)) {
    console.warn("[GHL Funnel] Rejected request with invalid authorization");
    return NextResponse.json(
      { received: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  let payload: JsonRecord;
  try {
    payload = asRecord(await request.json());
  } catch {
    return NextResponse.json(
      { received: false, error: "Invalid JSON payload" },
      { status: 400 },
    );
  }

  const customData = asRecord(payload.customData);
  const location = asRecord(payload.location);
  const workflow = asRecord(payload.workflow);
  const rawStage = firstString(
    customData.stage_slug,
    customData.stage,
    payload.stage_slug,
    payload.stage,
    payload.tag,
  );
  const stage = normalizeGhlFunnelStage(rawStage);

  if (!stage) {
    console.warn("[GHL Funnel] Rejected unknown stage", { rawStage });
    return NextResponse.json(
      { received: false, error: "Unknown funnel stage", stage: rawStage },
      { status: 422 },
    );
  }

  const contactId = firstString(customData.contact_id, payload.contact_id);
  if (!contactId) {
    return NextResponse.json(
      { received: false, error: "Missing contact_id" },
      { status: 422 },
    );
  }

  const firstName = firstString(payload.first_name);
  const lastName = firstString(payload.last_name);
  const fallbackName = [firstName, lastName].filter(Boolean).join(" ") || null;
  const contactName = firstString(
    customData.contact_name,
    payload.full_name,
    fallbackName,
  );
  const eventType =
    firstString(customData.event, payload.event) ?? "contact_tag_added";
  const quantity = parseNumber(
    customData.quantidade_pares ??
      customData.qntd_pares ??
      payload["Qntd Pares"] ??
      payload.quantidade_pares,
  );

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[GHL Funnel] Supabase service credentials are missing");
    return NextResponse.json(
      { received: false, error: "Persistence is not configured" },
      { status: 503 },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase
    .from("ghl_funnel_events")
    .insert({
      event_type: eventType,
      stage_slug: stage,
      stage_name: GHL_FUNNEL_STAGES[stage],
      contact_id: contactId,
      contact_name: contactName,
      contact_email: firstString(customData.contact_email, payload.email),
      contact_phone: firstString(customData.contact_phone, payload.phone),
      contact_company_name: firstString(
        customData.contact_company_name,
        payload.company_name,
        payload.Empresa,
      ),
      quantidade_pares: quantity,
      tags: parseTags(payload.tags),
      location_id: firstString(customData.location_id, location.id),
      workflow_id: firstString(workflow.id),
      workflow_name: firstString(workflow.name),
      contact_created_at: parseDate(payload.date_created),
      raw_payload: payload,
    })
    .select("id, received_at")
    .single();

  if (error) {
    console.error("[GHL Funnel] Failed to persist webhook", {
      code: error.code,
      message: error.message,
      stage,
    });
    return NextResponse.json(
      { received: false, error: "Failed to persist webhook" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      received: true,
      eventId: data.id,
      stage,
      stageName: GHL_FUNNEL_STAGES[stage],
      receivedAt: data.received_at,
    },
    { status: 201 },
  );
}

export async function GET() {
  return NextResponse.json({
    status: process.env.GHL_WEBHOOK_SECRET ? "ready" : "not_configured",
    service: "ghl-funnel-webhook",
    stages: Object.keys(GHL_FUNNEL_STAGES),
  });
}

export const runtime = "nodejs";
