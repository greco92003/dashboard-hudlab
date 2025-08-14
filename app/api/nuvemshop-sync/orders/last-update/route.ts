import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    // Get the most recent last_synced_at timestamp (no auth required for this simple check)
    const { data, error } = await supabase
      .from("nuvemshop_orders")
      .select("last_synced_at")
      .eq("sync_status", "synced")
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
    });
  } catch (error) {
    console.error("Error checking orders last update:", error);

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
