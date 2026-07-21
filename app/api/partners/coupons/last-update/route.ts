import { getSupabaseSecretKey } from "@/lib/supabase/keys-server";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireApprovedUser } from "@/lib/security/route-guards";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
);

export async function GET(request: NextRequest) {
  try {
    const access = await requireApprovedUser();
    if (!access.ok) return access.response;

    // Get the most recent updated_at timestamp from generated_coupons
    const { data, error } = await supabase
      .from("generated_coupons")
      .select("updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 is "no rows returned"
      throw new Error(`Database error: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      last_update: data?.updated_at || null,
    });
  } catch (error) {
    console.error("Error checking coupons last update:", error);

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
