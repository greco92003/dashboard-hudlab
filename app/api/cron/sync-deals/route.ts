import { NextRequest, NextResponse } from "next/server";
import { syncAllGhlDeals } from "@/lib/ghl/deals-cache";
import { requireCronSecret } from "@/lib/security/route-guards";

async function run(request: NextRequest) {
  const authError = requireCronSecret(request);
  if (authError) return authError;

  try {
    const result = await syncAllGhlDeals({
      source: "cron",
      requestId: request.headers.get("x-vercel-id") || crypto.randomUUID(),
    });
    return NextResponse.json({
      success: true,
      message: "GHL deals cache synchronized",
      ...result,
    });
  } catch (error) {
    console.error("GHL cron sync failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export const GET = run;
export const POST = run;
export const maxDuration = 300;
export const runtime = "nodejs";
