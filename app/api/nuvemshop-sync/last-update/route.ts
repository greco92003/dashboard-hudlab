import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    // Get the most recent last_synced_at timestamp from both orders and products
    const { data: ordersData, error: ordersError } = await supabase
      .from("nuvemshop_orders")
      .select("last_synced_at")
      .eq("sync_status", "synced")
      .order("last_synced_at", { ascending: false })
      .limit(1)
      .single();

    const { data: productsData, error: productsError } = await supabase
      .from("nuvemshop_products")
      .select("last_synced_at")
      .eq("sync_status", "synced")
      .order("last_synced_at", { ascending: false })
      .limit(1)
      .single();

    // Handle errors (PGRST116 is "no rows returned" which is acceptable)
    if (ordersError && ordersError.code !== "PGRST116") {
      throw new Error(`Orders database error: ${ordersError.message}`);
    }

    if (productsError && productsError.code !== "PGRST116") {
      throw new Error(`Products database error: ${productsError.message}`);
    }

    // Get the most recent update between orders and products
    const ordersLastUpdate = ordersData?.last_synced_at;
    const productsLastUpdate = productsData?.last_synced_at;

    let lastUpdate = null;
    if (ordersLastUpdate && productsLastUpdate) {
      lastUpdate = ordersLastUpdate > productsLastUpdate ? ordersLastUpdate : productsLastUpdate;
    } else if (ordersLastUpdate) {
      lastUpdate = ordersLastUpdate;
    } else if (productsLastUpdate) {
      lastUpdate = productsLastUpdate;
    }

    return NextResponse.json({
      success: true,
      last_update: lastUpdate,
      orders_last_update: ordersLastUpdate,
      products_last_update: productsLastUpdate,
    });
  } catch (error) {
    console.error("Error checking last update:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 }
    );
  }
}
