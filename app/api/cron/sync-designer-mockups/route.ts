import { NextRequest, NextResponse } from "next/server";
import { getAllDesigners } from "@/lib/constants/designers";
import { requireCronSecret } from "@/lib/security/route-guards";
import { POST as syncDesignerMockupsCache } from "@/app/api/designer-mockups-cache/route";

/**
 * Chama o sync na mesma função, sem fetch. O cron da Vercel chega pela URL do
 * deploy, que fica atrás do login da Vercel: o fetch para
 * request.nextUrl.origin voltava 401 "Protected deployment" e o cache dos
 * mockups ficou parado de 11/08 a 14/10/2026.
 */
function callSync(request: NextRequest, body: Record<string, unknown>) {
  return syncDesignerMockupsCache(
    new NextRequest(new URL("/api/designer-mockups-cache", request.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
      },
      body: JSON.stringify(body),
    }),
  );
}

export async function GET(request: NextRequest) {
  try {
    const authError = requireCronSecret(request);
    if (authError) return authError;

    console.log("🕐 CRON - Starting designer mockups sync...");

    const syncResponse = await callSync(request, {
      designers: getAllDesigners(), // Use centralized designer list
      forceSync: true, // Sempre forçar sync no cron
    });

    let syncResult;
    try {
      const responseText = await syncResponse.text();
      if (responseText) {
        syncResult = JSON.parse(responseText);
      } else {
        syncResult = { error: "Empty response from sync API" };
      }
    } catch (parseError) {
      console.error("❌ CRON - Failed to parse sync response:", parseError);
      syncResult = { error: "Invalid JSON response from sync API" };
    }

    if (!syncResponse.ok) {
      console.error("❌ CRON - Sync failed:", syncResult);
      return NextResponse.json(
        {
          error: "Sync failed",
          details:
            syncResult.error ||
            syncResult.details ||
            `HTTP ${syncResponse.status}`,
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      );
    }

    console.log("✅ CRON - Designer mockups sync completed:", {
      syncStats: syncResult.syncStats,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: "Designer mockups sync completed successfully",
      syncStats: syncResult.syncStats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ CRON - Error in designer mockups sync:", error);

    return NextResponse.json(
      {
        error: "Cron job failed",
        details: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// POST method for manual trigger
export async function POST(request: NextRequest) {
  try {
    const authError = requireCronSecret(request);
    if (authError) return authError;

    console.log("🔄 MANUAL - Starting designer mockups sync...");

    const body = await request.json();
    const { designers = getAllDesigners(), startDate, endDate } = body;

    const requestBody = {
      designers,
      startDate,
      endDate,
      forceSync: true,
    };

    console.log("📦 MANUAL - Request body:", requestBody);

    const syncResponse = await callSync(request, requestBody);

    console.log("📊 MANUAL - Sync response status:", syncResponse.status);

    let syncResult;
    try {
      const responseText = await syncResponse.text();
      if (responseText) {
        syncResult = JSON.parse(responseText);
      } else {
        syncResult = { error: "Empty response from sync API" };
      }
    } catch (parseError) {
      console.error("❌ MANUAL - Failed to parse sync response:", parseError);
      syncResult = { error: "Invalid JSON response from sync API" };
    }

    if (!syncResponse.ok) {
      console.error("❌ MANUAL - Sync failed:", syncResult);
      return NextResponse.json(
        {
          error: "Sync failed",
          details:
            syncResult.error ||
            syncResult.details ||
            `HTTP ${syncResponse.status}`,
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      );
    }

    console.log("✅ MANUAL - Designer mockups sync completed:", {
      syncStats: syncResult.syncStats,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: "Designer mockups sync completed successfully",
      data: syncResult.data,
      syncStats: syncResult.syncStats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ MANUAL - Error in designer mockups sync:", error);

    return NextResponse.json(
      {
        error: "Manual sync failed",
        details: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
