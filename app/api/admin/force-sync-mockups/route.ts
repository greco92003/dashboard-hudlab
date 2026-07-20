import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security/route-guards";

// This endpoint forces a sync of designer mockups data
// It can be called to manually trigger a full sync

export async function POST(request: NextRequest) {
  const access = await requireAdmin();
  if (!access.ok) return access.response;

  try {
    // Verify admin access
    const authHeader = request.headers.get("authorization");
    const adminKey = process.env.ADMIN_API_KEY;

    if (!adminKey || authHeader !== `Bearer ${adminKey}`) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    console.log("🔄 Force syncing designer mockups data...");

    // Call the sync endpoint
    const baseUrl = request.nextUrl.origin;
    const syncResponse = await fetch(`${baseUrl}/api/designer-mockups-cache`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        designers: ["Vítor", "Felipe"],
        forceSync: true,
      }),
    });

    const result = await syncResponse.json();

    if (!syncResponse.ok) {
      console.error("❌ Sync failed:", result);
      return NextResponse.json(
        {
          error: "Sync failed",
          details: result.error || result.details,
        },
        { status: 500 }
      );
    }

    console.log("✅ Force sync completed:", result);

    return NextResponse.json({
      success: true,
      message: "Designer mockups data synced successfully",
      syncStats: result.syncStats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Error:", error);
    return NextResponse.json(
      {
        error: "Failed to force sync",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
