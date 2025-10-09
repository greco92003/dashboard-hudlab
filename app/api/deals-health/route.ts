import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Create Supabase client
async function createSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );
}

// Health check endpoint for deals cache system
export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServer();
    const startTime = Date.now();

    // Get last sync status
    const { data: lastSync, error: syncError } = await supabase
      .from("deals_sync_log")
      .select("*")
      .order("sync_started_at", { ascending: false })
      .limit(1)
      .single();

    if (syncError && syncError.code !== "PGRST116") {
      // PGRST116 = no rows returned
      console.error("Error fetching sync status:", syncError);
    }

    // Get total deals in cache
    const { count: totalDeals, error: countError } = await supabase
      .from("deals_cache")
      .select("*", { count: "exact", head: true })
      .eq("sync_status", "synced");

    if (countError) {
      console.error("Error counting deals:", countError);
    }

    // Get deals with closing dates in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { count: recentDeals, error: recentError } = await supabase
      .from("deals_cache")
      .select("*", { count: "exact", head: true })
      .eq("sync_status", "synced")
      .not("closing_date", "is", null)
      .gte("closing_date", thirtyDaysAgo.toISOString());

    if (recentError) {
      console.error("Error counting recent deals:", recentError);
    }

    // Calculate cache health metrics
    const now = new Date();
    const responseTime = Date.now() - startTime;

    let cacheHealth = "healthy";
    const issues: string[] = [];

    // Check if we have recent sync
    if (!lastSync) {
      cacheHealth = "critical";
      issues.push("No sync records found");
    } else {
      const lastSyncTime = lastSync.sync_completed_at
        ? new Date(lastSync.sync_completed_at)
        : null;

      if (!lastSyncTime) {
        cacheHealth = "critical";
        issues.push("No completed sync found");
      } else {
        const timeSinceLastSync = now.getTime() - lastSyncTime.getTime();
        const minutesSinceLastSync = timeSinceLastSync / (1000 * 60);

        // Alert if no sync in last 45 minutes (should sync every 30 minutes)
        if (minutesSinceLastSync > 45) {
          cacheHealth = "warning";
          issues.push(
            `Last sync was ${Math.round(minutesSinceLastSync)} minutes ago`
          );
        }

        // Critical if no sync in last 2 hours
        if (minutesSinceLastSync > 120) {
          cacheHealth = "critical";
          issues.push(
            `Last sync was ${Math.round(
              minutesSinceLastSync
            )} minutes ago - sync may be broken`
          );
        }
      }

      // Check if last sync failed
      if (lastSync.sync_status === "failed") {
        cacheHealth = "warning";
        issues.push(
          `Last sync failed: ${lastSync.error_message || "Unknown error"}`
        );
      }

      // Check if sync is running too long (sync_completed_at is NULL)
      if (lastSync.sync_completed_at === null) {
        const syncStartTime = new Date(lastSync.sync_started_at);
        const syncDuration = now.getTime() - syncStartTime.getTime();
        const syncMinutes = syncDuration / (1000 * 60);

        if (syncMinutes > 10) {
          cacheHealth = "warning";
          issues.push(
            `Sync has been running for ${Math.round(syncMinutes)} minutes`
          );
        }
      }
    }

    // Check if we have enough deals
    if ((totalDeals || 0) < 10) {
      cacheHealth = "warning";
      issues.push(`Only ${totalDeals || 0} deals in cache`);
    }

    // Check response time
    if (responseTime > 2000) {
      cacheHealth = "warning";
      issues.push(`Slow response time: ${responseTime}ms`);
    }

    // Get sync history (last 5 syncs)
    const { data: syncHistory } = await supabase
      .from("deals_sync_log")
      .select(
        "sync_started_at, sync_completed_at, sync_status, deals_processed, sync_duration_seconds, error_message"
      )
      .order("sync_started_at", { ascending: false })
      .limit(5);

    // Calculate success rate
    const completedSyncs =
      syncHistory?.filter((s) => s.sync_status === "completed") || [];
    const successRate = syncHistory?.length
      ? (completedSyncs.length / syncHistory.length) * 100
      : 0;

    if (successRate < 80) {
      cacheHealth = "warning";
      issues.push(`Low sync success rate: ${successRate.toFixed(1)}%`);
    }

    const isRunning = lastSync?.sync_completed_at === null;

    const healthData = {
      status: cacheHealth,
      timestamp: now.toISOString(),
      responseTimeMs: responseTime,
      issues: issues.length > 0 ? issues : null,

      cache: {
        totalDeals: totalDeals || 0,
        recentDeals: recentDeals || 0,
        lastSyncAt: lastSync?.sync_completed_at || null,
        lastSyncStatus: lastSync?.sync_status || "unknown",
        lastSyncDuration: lastSync?.sync_duration_seconds || null,
        minutesSinceLastSync: lastSync?.sync_completed_at
          ? Math.round(
              (now.getTime() - new Date(lastSync.sync_completed_at).getTime()) /
                (1000 * 60)
            )
          : null,
      },

      sync: {
        successRate: Math.round(successRate),
        totalSyncs: syncHistory?.length || 0,
        lastError: lastSync?.error_message || null,
        isRunning: isRunning, // Sync está rodando se sync_completed_at for NULL
      },

      history:
        syncHistory?.map((sync) => ({
          startedAt: sync.sync_started_at,
          completedAt: sync.sync_completed_at,
          status: sync.sync_status,
          dealsProcessed: sync.deals_processed,
          durationSeconds: sync.sync_duration_seconds,
          error: sync.error_message,
        })) || [],
    };

    return NextResponse.json(healthData);
  } catch (error) {
    console.error("Health check error:", error);
    return NextResponse.json(
      {
        status: "critical",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
        issues: ["Health check failed"],
      },
      { status: 500 }
    );
  }
}

// POST endpoint to trigger emergency sync
export async function POST() {
  try {
    console.log("Emergency sync triggered via health endpoint");

    // Check if there's already a sync running
    const supabase = await createSupabaseServer();
    const { data: runningSyncs } = await supabase
      .from("deals_sync_log")
      .select("id, sync_status")
      .eq("sync_status", "running")
      .limit(1);

    if (runningSyncs && runningSyncs.length > 0) {
      return NextResponse.json(
        {
          error:
            "Uma sincronização já está em andamento. Aguarde a finalização para iniciar outra.",
          isRunning: true,
        },
        { status: 409 } // Conflict status
      );
    }

    // Trigger sync using parallel endpoint (for automated/emergency syncs)
    // This endpoint now logs to deals_sync_log for monitoring
    const syncResponse = await fetch(
      `${
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
      }/api/test/robust-deals-sync-parallel`,
      {
        method: "GET",
      }
    );

    if (!syncResponse.ok) {
      const errorText = await syncResponse.text();
      throw new Error(`Emergency sync failed: ${errorText}`);
    }

    const syncResult = await syncResponse.json();

    return NextResponse.json({
      message: "Emergency sync triggered successfully",
      timestamp: new Date().toISOString(),
      syncResult,
    });
  } catch (error) {
    console.error("Emergency sync error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// Set timeout for this API route
export const config = {
  maxDuration: 30, // 30 seconds
};
