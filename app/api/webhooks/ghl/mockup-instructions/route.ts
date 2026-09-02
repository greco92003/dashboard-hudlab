import { after, NextRequest, NextResponse } from "next/server";
import { verifyGhlWebhook } from "@/lib/ghl/webhook";
import { WEBHOOK_MAX_BODY_BYTES } from "@/lib/security/webhook-verification";
import { processMockupInstructionWebhook } from "@/lib/ghl/mockup-instructions/processor";

type JsonRecord = Record<string, unknown>;

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!rawBody || Buffer.byteLength(rawBody, "utf8") > WEBHOOK_MAX_BODY_BYTES) {
    return NextResponse.json(
      { accepted: false, error: "Invalid body" },
      { status: 400 },
    );
  }
  if (!verifyGhlWebhook(rawBody, request.headers)) {
    return NextResponse.json(
      { accepted: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  let payload: JsonRecord;
  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error();
    payload = parsed as JsonRecord;
  } catch {
    return NextResponse.json(
      { accepted: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }

  const requestedLocation =
    typeof payload.locationId === "string"
      ? payload.locationId
      : typeof (payload.customData as JsonRecord | undefined)?.location_id ===
          "string"
        ? String((payload.customData as JsonRecord).location_id)
        : null;
  if (
    requestedLocation &&
    process.env.GHL_LOCATION_ID &&
    requestedLocation !== process.env.GHL_LOCATION_ID
  ) {
    return NextResponse.json(
      { accepted: false, error: "Wrong location" },
      { status: 403 },
    );
  }

  // `wait=1` existe para testes controlados. Em produção respondemos rápido ao
  // GHL e mantemos o processamento dentro do ciclo de vida do request.
  if (request.nextUrl.searchParams.get("wait") === "1") {
    const result = await processMockupInstructionWebhook(payload);
    return NextResponse.json(result, { status: result.accepted ? 200 : 422 });
  }

  after(async () => {
    try {
      const result = await processMockupInstructionWebhook(payload);
      if (!result.accepted) {
        console.warn("Mockup instruction webhook was not processed", {
          reason: result.reason,
          payloadKeys: Object.keys(payload),
          customDataKeys:
            payload.customData && typeof payload.customData === "object"
              ? Object.keys(payload.customData as JsonRecord)
              : [],
        });
      }
    } catch (error) {
      console.error("Mockup instruction webhook crashed before completion", {
        error: error instanceof Error ? error.message : "Unknown error",
        payloadKeys: Object.keys(payload),
      });
    }
  });
  return NextResponse.json(
    { accepted: true, processing: "async" },
    { status: 202 },
  );
}

export async function GET() {
  return NextResponse.json({
    service: "ghl-mockup-instruction-agent",
    status:
      process.env.GHL_WEBHOOK_SECRET && process.env.OPENAI_API_KEY
        ? "ready"
        : "not_configured",
    targetPipeline: "Fábrica de Mockups",
    targetStages: ["Mockup PRIORIDADE", "Alteração", "Alteração Prioridade"],
  });
}

export const runtime = "nodejs";
export const maxDuration = 300;
