// =====================================================
// SINCRONIZAÇÃO BIDIRECIONAL - LIMPEZA
// =====================================================
// Verifica produtos e cupons que existem no banco mas não existem mais no NuvemShop

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerForSync } from "@/lib/supabase/server";
import { fetchNuvemshopAPI } from "@/lib/nuvemshop/api";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerForSync();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "all"; // products, coupons, or all

    console.log(`🧹 Starting cleanup sync for: ${type}`);

    // Start sync log
    const syncStartTime = new Date();
    const { data: syncLog, error: syncLogError } = await supabase
      .from("nuvemshop_sync_log")
      .insert({
        sync_type: `cleanup_${type}`,
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
      products: { checked: 0, deleted: 0, errors: 0 },
      coupons: { checked: 0, deleted: 0, errors: 0 },
    };

    // Cleanup products
    if (type === "products" || type === "all") {
      console.log("🛍️ Starting product cleanup...");
      results.products = await cleanupProducts(supabase);
    }

    // Cleanup coupons
    if (type === "coupons" || type === "all") {
      console.log("🎫 Starting coupon cleanup...");
      results.coupons = await cleanupCoupons(supabase);
    }

    // Update sync log with completion
    const syncEndTime = new Date();
    const durationSeconds = Math.floor(
      (syncEndTime.getTime() - syncStartTime.getTime()) / 1000
    );

    await supabase
      .from("nuvemshop_sync_log")
      .update({
        status: "completed",
        completed_at: syncEndTime.toISOString(),
        duration_seconds: durationSeconds,
        records_processed: results.products.checked + results.coupons.checked,
        records_updated: results.products.deleted + results.coupons.deleted,
        error_count: results.products.errors + results.coupons.errors,
        result_summary: results,
      })
      .eq("id", syncLog.id);

    console.log("✅ Cleanup sync completed:", results);

    return NextResponse.json({
      success: true,
      message: "Cleanup sync completed",
      results,
      duration_seconds: durationSeconds,
    });
  } catch (error) {
    console.error("❌ Cleanup sync error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Cleanup products that no longer exist in NuvemShop
async function cleanupProducts(supabase: any) {
  const stats = { checked: 0, deleted: 0, errors: 0 };

  try {
    // Get all active products from our database
    const { data: localProducts, error: localError } = await supabase
      .from("nuvemshop_products")
      .select("product_id, name_pt")
      .neq("sync_status", "deleted")
      .order("created_at", { ascending: false });

    if (localError) {
      throw new Error(`Failed to fetch local products: ${localError.message}`);
    }

    console.log(`📋 Found ${localProducts.length} active products in database`);

    // Check each product in batches
    const batchSize = 50;
    for (let i = 0; i < localProducts.length; i += batchSize) {
      const batch = localProducts.slice(i, i + batchSize);

      for (const product of batch) {
        stats.checked++;

        try {
          // Try to fetch product from NuvemShop API
          const response = await fetchNuvemshopAPI(
            `/products/${product.product_id}`
          );

          if (!response || response.error) {
            // Product doesn't exist in NuvemShop anymore
            console.log(
              `🗑️ Product ${product.product_id} (${product.name_pt}) no longer exists in NuvemShop`
            );

            const { error: updateError } = await supabase
              .from("nuvemshop_products")
              .update({
                sync_status: "deleted",
                last_synced_at: new Date().toISOString(),
              })
              .eq("product_id", product.product_id);

            if (updateError) {
              console.error(
                `Error marking product ${product.product_id} as deleted:`,
                updateError
              );
              stats.errors++;
            } else {
              stats.deleted++;
            }
          }
        } catch (error) {
          // If it's a 404 error, the product was deleted
          if (error instanceof Error && error.message.includes("404")) {
            console.log(
              `🗑️ Product ${product.product_id} (${product.name_pt}) returned 404 - marking as deleted`
            );

            const { error: updateError } = await supabase
              .from("nuvemshop_products")
              .update({
                sync_status: "deleted",
                last_synced_at: new Date().toISOString(),
              })
              .eq("product_id", product.product_id);

            if (updateError) {
              console.error(
                `Error marking product ${product.product_id} as deleted:`,
                updateError
              );
              stats.errors++;
            } else {
              stats.deleted++;
            }
          } else {
            console.error(
              `Error checking product ${product.product_id}:`,
              error
            );
            stats.errors++;
          }
        }

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      console.log(
        `📊 Products batch ${Math.floor(i / batchSize) + 1} completed. Stats:`,
        stats
      );
    }
  } catch (error) {
    console.error("Error in cleanupProducts:", error);
    stats.errors++;
  }

  return stats;
}

// Cleanup coupons that no longer exist in NuvemShop
async function cleanupCoupons(supabase: any) {
  const stats = { checked: 0, deleted: 0, errors: 0 };

  try {
    // Get all active coupons from our database that have nuvemshop_coupon_id
    const { data: localCoupons, error: localError } = await supabase
      .from("generated_coupons")
      .select("id, code, nuvemshop_coupon_id")
      .neq("nuvemshop_status", "deleted")
      .not("nuvemshop_coupon_id", "is", null)
      .order("created_at", { ascending: false });

    if (localError) {
      throw new Error(`Failed to fetch local coupons: ${localError.message}`);
    }

    console.log(`📋 Found ${localCoupons.length} active coupons in database`);

    // Check each coupon
    for (const coupon of localCoupons) {
      stats.checked++;

      try {
        // Try to fetch coupon from NuvemShop API
        const response = await fetchNuvemshopAPI(
          `/coupons/${coupon.nuvemshop_coupon_id}`
        );

        if (!response || response.error) {
          // Coupon doesn't exist in NuvemShop anymore
          console.log(
            `🗑️ Coupon ${coupon.code} (ID: ${coupon.nuvemshop_coupon_id}) no longer exists in NuvemShop`
          );

          const { error: updateError } = await supabase
            .from("generated_coupons")
            .update({
              nuvemshop_status: "deleted",
              is_active: false,
              updated_at: new Date().toISOString(),
            })
            .eq("id", coupon.id);

          if (updateError) {
            console.error(
              `Error marking coupon ${coupon.code} as deleted:`,
              updateError
            );
            stats.errors++;
          } else {
            stats.deleted++;
          }
        }
      } catch (error) {
        // If it's a 404 error, the coupon was deleted
        if (error instanceof Error && error.message.includes("404")) {
          console.log(
            `🗑️ Coupon ${coupon.code} returned 404 - marking as deleted`
          );

          const { error: updateError } = await supabase
            .from("generated_coupons")
            .update({
              nuvemshop_status: "deleted",
              is_active: false,
              updated_at: new Date().toISOString(),
            })
            .eq("id", coupon.id);

          if (updateError) {
            console.error(
              `Error marking coupon ${coupon.code} as deleted:`,
              updateError
            );
            stats.errors++;
          } else {
            stats.deleted++;
          }
        } else {
          console.error(`Error checking coupon ${coupon.code}:`, error);
          stats.errors++;
        }
      }

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  } catch (error) {
    console.error("Error in cleanupCoupons:", error);
    stats.errors++;
  }

  return stats;
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    status: "healthy",
    endpoint: "cleanup",
    timestamp: new Date().toISOString(),
  });
}
