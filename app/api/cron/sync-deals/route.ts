import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Create Supabase client with service role key for cron operations
// This bypasses RLS policies and allows full database access for automated tasks
function createSupabaseServiceClient() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new Error("Missing Supabase environment variables");
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

// Removed shouldSync function - cron will always sync like manual button

// Cron job endpoint - runs daily at 6 AM
// Uses same logic as manual sync button (always syncs, 90 days period)
export async function GET(request: NextRequest) {
  try {
    // Verify this is a legitimate cron request
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.log("Unauthorized cron request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log(
      "🚀 Cron job triggered - starting sync (same as manual button)..."
    );

    // Use same logic as manual sync button - sync all deals from ActiveCampaign
    // Using parallel endpoint which now logs sync progress to deals_sync_log
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes timeout (Hobby plan limit)

    const syncResponse = await fetch(
      `${
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
      }/api/test/robust-deals-sync-parallel?allDeals=true`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!syncResponse.ok) {
      const errorText = await syncResponse.text();
      console.error("Sync failed:", errorText);
      return NextResponse.json(
        { error: `Sync failed: ${errorText}` },
        { status: 500 }
      );
    }

    const syncResult = await syncResponse.json();
    console.log("✅ Cron sync completed successfully:", syncResult);

    return NextResponse.json({
      message: "Cron sync completed successfully",
      timestamp: new Date().toISOString(),
      syncResult,
    });
  } catch (error) {
    console.error("Cron job error:", error);

    let errorMessage = "Erro desconhecido";
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        errorMessage = "Sincronização cancelada por timeout (10 minutos)";
      } else {
        errorMessage = error.message;
      }
    }

    return NextResponse.json(
      {
        error: errorMessage,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Manual trigger endpoint (for testing) - same logic as GET and manual button
export async function POST() {
  try {
    console.log(
      "🚀 Manual cron trigger requested - using same logic as manual button..."
    );

    // Use same logic as manual sync button and GET endpoint - sync all deals
    // Using parallel endpoint which now logs sync progress to deals_sync_log
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes timeout (Hobby plan limit)

    const syncResponse = await fetch(
      `${
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
      }/api/test/robust-deals-sync-parallel?allDeals=true`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!syncResponse.ok) {
      const errorText = await syncResponse.text();
      throw new Error(`Sync failed: ${errorText}`);
    }

    const syncResult = await syncResponse.json();
    console.log("✅ Manual cron trigger completed successfully:", syncResult);

    return NextResponse.json({
      message: "Manual cron trigger completed successfully",
      timestamp: new Date().toISOString(),
      syncResult,
    });
  } catch (error) {
    console.error("Manual cron trigger error:", error);

    let errorMessage = "Erro desconhecido";
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        errorMessage = "Sincronização cancelada por timeout (5 minutos)";
      } else {
        errorMessage = error.message;
      }
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// Set timeout for this API route - 5 minutes (Hobby plan limit)
export const config = {
  maxDuration: 300, // 5 minutes
};
