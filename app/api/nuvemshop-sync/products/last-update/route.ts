import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    // Get the most recent last_synced_at timestamp from both synced and deleted products
    // This ensures we detect when products are deleted via webhooks
    const { data, error } = await supabase
      .from("nuvemshop_products")
      .select("last_synced_at, sync_status")
      .in("sync_status", ["synced", "deleted"])
      .order("last_synced_at", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 is "no rows returned"
      throw new Error(`Database error: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      last_update: data?.last_synced_at || null,
      includes_deletions: data?.sync_status === "deleted",
    });
  } catch (error) {
    console.error("Error getting last update:", error);
    return NextResponse.json(
      {
        error: "Failed to get last update",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
