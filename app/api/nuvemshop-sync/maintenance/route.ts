// =====================================================
// MANUTENÇÃO COMPLETA DO NUVEMSHOP
// =====================================================
// Executa todas as operações de limpeza e manutenção

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerForSync } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerForSync();
    const { searchParams } = new URL(request.url);
    const operations = searchParams.get("operations")?.split(",") || ["cleanup", "deduplicate"];
    const dryRun = searchParams.get("dry_run") === "true";

    console.log(`🔧 Starting maintenance operations: ${operations.join(", ")} ${dryRun ? "(DRY RUN)" : ""}`);

    // Start sync log
    const syncStartTime = new Date();
    const { data: syncLog, error: syncLogError } = await supabase
      .from("nuvemshop_sync_log")
      .insert({
        sync_type: `maintenance_${operations.join("_")}${dryRun ? "_dry_run" : ""}`,
        status: "running",
        started_at: syncStartTime.toISOString(),
        triggered_by: "manual",
      })
      .select("id")
      .single();

    if (syncLogError) {
      throw new Error(`Failed to create sync log: ${syncLogError.message}`);
    }

    const results = {
      operations_completed: [] as string[],
      cleanup: null as any,
      deduplication: null as any,
      errors: [] as string[],
    };

    // Execute cleanup operations
    if (operations.includes("cleanup")) {
      try {
        console.log("🧹 Starting cleanup operations...");
        results.cleanup = await performCleanup(supabase);
        results.operations_completed.push("cleanup");
        console.log("✅ Cleanup completed");
      } catch (error) {
        const errorMsg = `Cleanup failed: ${error instanceof Error ? error.message : "Unknown error"}`;
        console.error("❌", errorMsg);
        results.errors.push(errorMsg);
      }
    }

    // Execute deduplication
    if (operations.includes("deduplicate")) {
      try {
        console.log("🔍 Starting deduplication...");
        results.deduplication = await performDeduplication(supabase, dryRun);
        results.operations_completed.push("deduplicate");
        console.log("✅ Deduplication completed");
      } catch (error) {
        const errorMsg = `Deduplication failed: ${error instanceof Error ? error.message : "Unknown error"}`;
        console.error("❌", errorMsg);
        results.errors.push(errorMsg);
      }
    }

    // Update sync log with completion
    const syncEndTime = new Date();
    const durationSeconds = Math.floor(
      (syncEndTime.getTime() - syncStartTime.getTime()) / 1000
    );

    const totalProcessed = (results.cleanup?.products?.checked || 0) + 
                          (results.cleanup?.coupons?.checked || 0) +
                          (results.deduplication?.total_products_checked || 0);

    const totalUpdated = (results.cleanup?.products?.deleted || 0) + 
                        (results.cleanup?.coupons?.deleted || 0) +
                        (results.deduplication?.products_marked_as_deleted || 0);

    await supabase
      .from("nuvemshop_sync_log")
      .update({
        status: results.errors.length > 0 ? "completed_with_errors" : "completed",
        completed_at: syncEndTime.toISOString(),
        duration_seconds: durationSeconds,
        records_processed: totalProcessed,
        records_updated: totalUpdated,
        error_count: results.errors.length,
        result_summary: results,
      })
      .eq("id", syncLog.id);

    console.log("🎉 Maintenance operations completed:", results);

    return NextResponse.json({
      success: results.errors.length === 0,
      message: `Maintenance operations ${dryRun ? "simulation" : ""} completed`,
      results,
      duration_seconds: durationSeconds,
      warnings: results.errors.length > 0 ? results.errors : undefined,
    });

  } catch (error) {
    console.error("❌ Maintenance error:", error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
}

// Perform cleanup operations
async function performCleanup(supabase: any) {
  const results = {
    products: { checked: 0, deleted: 0, errors: 0 },
    coupons: { checked: 0, deleted: 0, errors: 0 },
  };

  // Import cleanup functions (we'll call the API internally)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  
  try {
    const cleanupResponse = await fetch(`${baseUrl}/api/nuvemshop-sync/cleanup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (cleanupResponse.ok) {
      const cleanupData = await cleanupResponse.json();
      return cleanupData.results;
    } else {
      throw new Error(`Cleanup API returned ${cleanupResponse.status}`);
    }
  } catch (error) {
    console.error("Error calling cleanup API:", error);
    throw error;
  }
}

// Perform deduplication
async function performDeduplication(supabase: any, dryRun: boolean) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  
  try {
    const dedupeResponse = await fetch(`${baseUrl}/api/nuvemshop-sync/deduplicate?dry_run=${dryRun}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (dedupeResponse.ok) {
      const dedupeData = await dedupeResponse.json();
      return dedupeData.results;
    } else {
      throw new Error(`Deduplication API returned ${dedupeResponse.status}`);
    }
  } catch (error) {
    console.error("Error calling deduplication API:", error);
    throw error;
  }
}

// Get maintenance status and recommendations
export async function GET() {
  try {
    const supabase = await createSupabaseServerForSync();

    // Get statistics about potential issues
    const stats = await getMaintenanceStats(supabase);

    return NextResponse.json({
      status: "healthy",
      endpoint: "maintenance",
      timestamp: new Date().toISOString(),
      recommendations: generateRecommendations(stats),
      stats,
    });

  } catch (error) {
    console.error("❌ Error getting maintenance status:", error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
}

// Get maintenance statistics
async function getMaintenanceStats(supabase: any) {
  const stats = {
    total_products: 0,
    active_products: 0,
    deleted_products: 0,
    total_coupons: 0,
    active_coupons: 0,
    deleted_coupons: 0,
    potential_duplicate_products: 0,
    last_cleanup: null as string | null,
    last_deduplication: null as string | null,
  };

  try {
    // Product statistics
    const { data: productStats } = await supabase
      .from("nuvemshop_products")
      .select("sync_status")
      .then((result: any) => {
        if (result.data) {
          stats.total_products = result.data.length;
          stats.active_products = result.data.filter((p: any) => p.sync_status !== "deleted").length;
          stats.deleted_products = result.data.filter((p: any) => p.sync_status === "deleted").length;
        }
        return result;
      });

    // Coupon statistics
    const { data: couponStats } = await supabase
      .from("generated_coupons")
      .select("nuvemshop_status, is_active")
      .then((result: any) => {
        if (result.data) {
          stats.total_coupons = result.data.length;
          stats.active_coupons = result.data.filter((c: any) => c.is_active && c.nuvemshop_status !== "deleted").length;
          stats.deleted_coupons = result.data.filter((c: any) => c.nuvemshop_status === "deleted").length;
        }
        return result;
      });

    // Check for potential duplicates (simplified check)
    const { data: duplicateCheck } = await supabase
      .rpc('count_potential_duplicates')
      .then((result: any) => {
        if (result.data) {
          stats.potential_duplicate_products = result.data;
        }
        return result;
      })
      .catch(() => {
        // If RPC doesn't exist, use a simple count
        return { data: 0 };
      });

    // Get last maintenance operations
    const { data: lastOperations } = await supabase
      .from("nuvemshop_sync_log")
      .select("sync_type, completed_at")
      .like("sync_type", "cleanup%")
      .or("sync_type.like.deduplicate%")
      .order("completed_at", { ascending: false })
      .limit(10);

    if (lastOperations) {
      const lastCleanup = lastOperations.find((op: any) => op.sync_type.includes("cleanup"));
      const lastDedupe = lastOperations.find((op: any) => op.sync_type.includes("deduplicate"));
      
      stats.last_cleanup = lastCleanup?.completed_at || null;
      stats.last_deduplication = lastDedupe?.completed_at || null;
    }

  } catch (error) {
    console.error("Error getting maintenance stats:", error);
  }

  return stats;
}

// Generate maintenance recommendations
function generateRecommendations(stats: any) {
  const recommendations = [];

  if (stats.potential_duplicate_products > 0) {
    recommendations.push({
      type: "warning",
      action: "deduplicate",
      message: `Found ${stats.potential_duplicate_products} potential duplicate products`,
    });
  }

  if (stats.deleted_products > stats.active_products * 0.1) {
    recommendations.push({
      type: "info",
      action: "cleanup",
      message: `High number of deleted products (${stats.deleted_products}). Consider cleanup.`,
    });
  }

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  if (!stats.last_cleanup || new Date(stats.last_cleanup) < oneWeekAgo) {
    recommendations.push({
      type: "suggestion",
      action: "cleanup",
      message: "Cleanup hasn't been run in over a week",
    });
  }

  if (!stats.last_deduplication || new Date(stats.last_deduplication) < oneWeekAgo) {
    recommendations.push({
      type: "suggestion",
      action: "deduplicate",
      message: "Deduplication hasn't been run in over a week",
    });
  }

  return recommendations;
}
