import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    // Verificar se a requisição tem o secret correto
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error("❌ CRON_SECRET not configured");
      return NextResponse.json(
        { error: "Cron secret not configured" },
        { status: 500 }
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      console.error("❌ Invalid cron secret");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("🕐 CRON - Starting designer mockups sync...");

    // Chamar a API de sincronização
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const syncResponse = await fetch(`${baseUrl}/api/designer-mockups-cache`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        designers: ["Vítor", "Felipe"], // Lista padrão de designers
        forceSync: true, // Sempre forçar sync no cron
      }),
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
    console.log("🔄 MANUAL - Starting designer mockups sync...");

    const body = await request.json();
    const { designers = ["Vítor", "Felipe"], startDate, endDate } = body;

    // Chamar a API de sincronização
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const syncUrl = `${baseUrl}/api/designer-mockups-cache`;
    const requestBody = {
      designers,
      startDate,
      endDate,
      forceSync: true,
    };

    console.log("🔗 MANUAL - Calling sync API:", syncUrl);
    console.log("📦 MANUAL - Request body:", requestBody);

    const syncResponse = await fetch(syncUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    console.log("📊 MANUAL - Sync response status:", syncResponse.status);
    console.log(
      "📊 MANUAL - Sync response headers:",
      Object.fromEntries(syncResponse.headers.entries())
    );

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
