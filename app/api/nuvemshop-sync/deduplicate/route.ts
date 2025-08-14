// =====================================================
// DEDUPLICAÇÃO DE PRODUTOS
// =====================================================
// Remove produtos duplicados priorizando os ativos e mais recentes

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerForSync } from "@/lib/supabase/server";

// Type for product data used in deduplication
type ProductForDeduplication = {
  product_id: number;
  name_pt: string;
  brand: string;
  sync_status: string;
  created_at: string;
  last_synced_at: string | null;
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerForSync();
    const { searchParams } = new URL(request.url);
    const dryRun = searchParams.get("dry_run") === "true"; // Se true, apenas simula sem fazer alterações

    console.log(
      `🔍 Starting product deduplication ${dryRun ? "(DRY RUN)" : ""}`
    );

    // Start sync log
    const syncStartTime = new Date();
    const { data: syncLog, error: syncLogError } = await supabase
      .from("nuvemshop_sync_log")
      .insert({
        sync_type: `deduplicate_products${dryRun ? "_dry_run" : ""}`,
        status: "running",
        started_at: syncStartTime.toISOString(),
        triggered_by: "manual",
      })
      .select("id")
      .single();

    if (syncLogError) {
      throw new Error(`Failed to create sync log: ${syncLogError.message}`);
    }

    const results = await deduplicateProducts(supabase, dryRun);

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
        records_processed: results.total_duplicates_found,
        records_updated: results.products_marked_as_deleted,
        result_summary: results,
      })
      .eq("id", syncLog.id);

    console.log("✅ Deduplication completed:", results);

    return NextResponse.json({
      success: true,
      message: `Deduplication ${dryRun ? "simulation" : ""} completed`,
      results,
      duration_seconds: durationSeconds,
    });
  } catch (error) {
    console.error("❌ Deduplication error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Main deduplication function
async function deduplicateProducts(supabase: any, dryRun: boolean) {
  const stats = {
    total_products_checked: 0,
    duplicate_groups_found: 0,
    total_duplicates_found: 0,
    products_marked_as_deleted: 0,
    errors: 0,
    duplicate_groups: [] as any[],
  };

  try {
    // Find products with duplicate names (case-insensitive)
    const { data: duplicateGroups, error: duplicateError } = await supabase.rpc(
      "find_duplicate_products"
    );

    if (duplicateError) {
      // If the function doesn't exist, use a manual query
      console.log("RPC function not found, using manual query...");

      const { data: allProducts, error: allError } = await supabase
        .from("nuvemshop_products")
        .select(
          "product_id, name_pt, brand, sync_status, created_at, last_synced_at"
        )
        .order("name_pt");

      if (allError) {
        throw new Error(`Failed to fetch products: ${allError.message}`);
      }

      // Group products by normalized name
      const groupedProducts = new Map();

      for (const product of allProducts) {
        if (!product.name_pt) continue;

        const normalizedName = product.name_pt.toLowerCase().trim();
        if (!groupedProducts.has(normalizedName)) {
          groupedProducts.set(normalizedName, []);
        }
        groupedProducts.get(normalizedName).push(product);
      }

      // Filter groups with more than one product
      const duplicates = Array.from(groupedProducts.entries())
        .filter(([_, products]) => products.length > 1)
        .map(([name, products]) => ({ name, products }));

      stats.total_products_checked = allProducts.length;
      stats.duplicate_groups_found = duplicates.length;

      for (const group of duplicates) {
        stats.total_duplicates_found += group.products.length;

        console.log(
          `📋 Found ${group.products.length} products with name: "${group.name}"`
        );

        // Sort products to determine which to keep
        const sortedProducts = group.products.sort(
          (a: ProductForDeduplication, b: ProductForDeduplication) => {
            // Priority 1: Active products first
            if (a.sync_status !== "deleted" && b.sync_status === "deleted")
              return -1;
            if (a.sync_status === "deleted" && b.sync_status !== "deleted")
              return 1;

            // Priority 2: More recently synced
            const aDate = new Date(a.last_synced_at || a.created_at);
            const bDate = new Date(b.last_synced_at || b.created_at);
            return bDate.getTime() - aDate.getTime();
          }
        );

        const keepProduct = sortedProducts[0];
        const duplicatesToDelete = sortedProducts.slice(1);

        const groupInfo = {
          name: group.name,
          total_products: group.products.length,
          keep_product: {
            product_id: keepProduct.product_id,
            brand: keepProduct.brand,
            sync_status: keepProduct.sync_status,
            created_at: keepProduct.created_at,
          },
          products_to_delete: duplicatesToDelete.map(
            (p: ProductForDeduplication) => ({
              product_id: p.product_id,
              brand: p.brand,
              sync_status: p.sync_status,
              created_at: p.created_at,
            })
          ),
        };

        stats.duplicate_groups.push(groupInfo);

        console.log(
          `✅ Keeping product: ${keepProduct.product_id} (${keepProduct.sync_status})`
        );
        console.log(
          `🗑️ Will ${dryRun ? "simulate" : ""} delete ${
            duplicatesToDelete.length
          } duplicates`
        );

        // Mark duplicates as deleted (unless it's a dry run)
        if (!dryRun && duplicatesToDelete.length > 0) {
          const productIdsToDelete = duplicatesToDelete
            .filter((p: ProductForDeduplication) => p.sync_status !== "deleted")
            .map((p: ProductForDeduplication) => p.product_id);

          if (productIdsToDelete.length > 0) {
            const { error: deleteError } = await supabase
              .from("nuvemshop_products")
              .update({
                sync_status: "deleted",
                last_synced_at: new Date().toISOString(),
              })
              .in("product_id", productIdsToDelete);

            if (deleteError) {
              console.error(
                `Error marking duplicates as deleted:`,
                deleteError
              );
              stats.errors++;
            } else {
              stats.products_marked_as_deleted += productIdsToDelete.length;
              console.log(
                `✅ Marked ${productIdsToDelete.length} duplicates as deleted`
              );
            }
          }
        } else if (dryRun) {
          const wouldDelete = duplicatesToDelete.filter(
            (p: ProductForDeduplication) => p.sync_status !== "deleted"
          ).length;
          stats.products_marked_as_deleted += wouldDelete;
        }
      }
    }
  } catch (error) {
    console.error("Error in deduplicateProducts:", error);
    stats.errors++;
  }

  return stats;
}

// Create the RPC function for finding duplicates (to be run in Supabase)
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerForSync();

    // Create the RPC function in the database
    const createFunctionSQL = `
      CREATE OR REPLACE FUNCTION find_duplicate_products()
      RETURNS TABLE (
        name TEXT,
        products JSONB
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT 
          LOWER(TRIM(p.name_pt)) as name,
          JSONB_AGG(
            JSONB_BUILD_OBJECT(
              'product_id', p.product_id,
              'name_pt', p.name_pt,
              'brand', p.brand,
              'sync_status', p.sync_status,
              'created_at', p.created_at,
              'last_synced_at', p.last_synced_at
            )
          ) as products
        FROM nuvemshop_products p
        WHERE p.name_pt IS NOT NULL AND p.name_pt != ''
        GROUP BY LOWER(TRIM(p.name_pt))
        HAVING COUNT(*) > 1
        ORDER BY COUNT(*) DESC;
      END;
      $$ LANGUAGE plpgsql;
    `;

    const { error } = await supabase.rpc("exec_sql", {
      sql: createFunctionSQL,
    });

    if (error) {
      throw new Error(`Failed to create RPC function: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      message: "RPC function created successfully",
    });
  } catch (error) {
    console.error("❌ Error creating RPC function:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    status: "healthy",
    endpoint: "deduplicate",
    timestamp: new Date().toISOString(),
  });
}
