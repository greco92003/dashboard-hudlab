import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseSecretKey } from "@/lib/supabase/keys-server";
import {
  firstHeader,
  verifyHmacWebhook,
} from "@/lib/security/webhook-verification";
import {
  buildWebhookIdempotencyKey,
  claimWebhookEvent,
} from "@/lib/security/webhook-idempotency";

const STAGE_SLUGS: Record<string, string> = {
  lead: "Lead",
  emailcoletado: "Email Coletado",
  viumockupautomatico: "Viu Mockup Automático",
  conheceumodeloseprecos: "Conheceu Modelos e Preços",
  solicitouorcamento: "Solicitou Orçamento",
  informouquantidade: "Informou Quantidade",
  informouestado: "Informou Estado",
  orcamentogerado: "Orçamento Gerado",
  solicitoumockupoficial: "Solicitou Mockup Oficial",
  negociofechado: "Negócio Fechado",
};

function normalizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "");
}

function extractSubscriberId(payload: Record<string, unknown>): string | null {
  const candidates = [
    payload.subscriber_id,
    payload.id,
    payload.user_id,
    payload.contact_id,
  ];
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null && candidate !== "") {
      return String(candidate);
    }
  }
  return null;
}

interface ContactFields {
  nome: string | null;
  telefone: string | null;
  email: string | null;
  quantidade_pares: number | null;
}

function extractContactFields(payload: Record<string, unknown>): ContactFields {
  const raw = (key: string) => payload[key];
  const str = (key: string): string | null => {
    const value = raw(key);
    if (value === undefined || value === null || value === "") return null;
    return String(value);
  };

  const nome =
    str("nome") ||
    str("name") ||
    str("full_name") ||
    [str("first_name"), str("last_name")].filter(Boolean).join(" ") ||
    null;
  const telefone =
    str("telefone") || str("phone") || str("phone_number") || str("whatsapp");
  const email = str("email") || str("email_address");
  const rawQuantity =
    raw("quantidade_pares") ?? raw("pares") ?? raw("quantity") ?? raw("qtd");
  const parsedQuantity = Number(rawQuantity);

  return {
    nome,
    telefone,
    email,
    quantidade_pares:
      rawQuantity !== undefined &&
      rawQuantity !== null &&
      rawQuantity !== "" &&
      Number.isFinite(parsedQuantity)
        ? parsedQuantity
        : null,
  };
}

function verificationFailureStatus(error: string): number {
  if (error === "missing_secret") return 503;
  if (error === "body_too_large") return 413;
  if (error === "stale_timestamp") return 409;
  return 401;
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    if (!rawBody) {
      return NextResponse.json({ error: "Empty payload" }, { status: 400 });
    }

    let payload: Record<string, unknown>;
    try {
      const parsed = JSON.parse(rawBody);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Invalid object");
      }
      payload = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const verification = verifyHmacWebhook({
      rawBody,
      signature: firstHeader(request.headers, [
        "x-manychat-signature",
        "x-webhook-signature",
      ]),
      secret: process.env.MANYCHAT_WEBHOOK_SECRET,
      timestamp:
        firstHeader(request.headers, [
          "x-manychat-timestamp",
          "x-webhook-timestamp",
        ]) ??
        payload.timestamp ??
        payload.event_timestamp ??
        payload.occurred_at ??
        payload.created_at,
    });
    if (!verification.ok) {
      return NextResponse.json(
        { error: "Webhook verification failed" },
        { status: verificationFailureStatus(verification.error) },
      );
    }

    const { searchParams } = new URL(request.url);
    const rawStage =
      (typeof payload.stage === "string" ? payload.stage : null) ||
      (typeof payload.tag === "string" ? payload.tag : null) ||
      searchParams.get("stage") ||
      "";
    const stageParam = normalizeSlug(rawStage);
    if (!stageParam || !STAGE_SLUGS[stageParam]) {
      return NextResponse.json({ error: "Unknown stage" }, { status: 422 });
    }

    const subscriberId = extractSubscriberId(payload);
    if (!subscriberId) {
      return NextResponse.json(
        { error: "Missing subscriber identifier" },
        { status: 422 },
      );
    }

    const explicitIdempotencyKey =
      firstHeader(request.headers, [
        "x-manychat-event-id",
        "x-idempotency-key",
      ]) ??
      (typeof payload.event_id === "string" ? payload.event_id : null);
    const claim = await claimWebhookEvent({
      provider: "manychat",
      idempotencyKey: buildWebhookIdempotencyKey(
        "manychat",
        explicitIdempotencyKey,
        rawBody,
      ),
      payloadSha256: verification.payloadSha256,
      requestTimestamp: verification.timestamp,
    });
    if (!claim.claimed) {
      return NextResponse.json({ error: "Replay rejected" }, { status: 409 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      return NextResponse.json(
        { error: "Persistence is not configured" },
        { status: 503 },
      );
    }
    const supabase = createClient(supabaseUrl, getSupabaseSecretKey(), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const stageName = STAGE_SLUGS[stageParam];
    const contactFields = extractContactFields(payload);
    const { error } = await supabase.from("manychat_tag_events").insert({
      stage_slug: stageParam,
      stage_name: stageName,
      subscriber_id: subscriberId,
      nome: contactFields.nome,
      telefone: contactFields.telefone,
      email: contactFields.email,
      quantidade_pares: contactFields.quantidade_pares,
      payload,
      occurred_at: verification.timestamp?.toISOString(),
    });

    if (error) {
      console.error("[ManyChat Webhook] Persistence failed", {
        code: error.code,
      });
      return NextResponse.json({ error: "Persistence failed" }, { status: 500 });
    }

    return NextResponse.json(
      { received: true, stage: stageName },
      { status: 201 },
    );
  } catch {
    console.error("[ManyChat Webhook] Unexpected failure");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok" });
}

export const runtime = "nodejs";
