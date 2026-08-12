import { NextRequest, NextResponse } from "next/server";
import { secureWebhookMiddleware } from "@/lib/nuvemshop/webhook-security";

export async function POST(request: NextRequest) {
  const security = await secureWebhookMiddleware(request);
  if (!security.isValid) {
    return NextResponse.json(
      { error: "Webhook rejected" },
      { status: security.status },
    );
  }
  return NextResponse.json({ success: true });
}

export const runtime = "nodejs";
