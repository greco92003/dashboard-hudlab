import { NextRequest, NextResponse } from "next/server";
import { syncAllGhlDeals } from "@/lib/ghl/deals-cache";
import { requireAdminOrCron } from "@/lib/security/route-guards";

async function runSync(request: NextRequest) {
  const accessError = await requireAdminOrCron(request);
  if (accessError) return accessError;

  try {
    const source = request.headers.has("authorization") ? "cron" : "manual";
    const result = await syncAllGhlDeals({
      source,
      requestId: request.headers.get("x-vercel-id") || crypto.randomUUID(),
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("GHL deals sync failed", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export const GET = runSync;
export const POST = runSync;
export const maxDuration = 300;
export const runtime = "nodejs";
