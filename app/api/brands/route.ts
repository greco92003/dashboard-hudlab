import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

// GET - Fetch all available brands from products
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user has permission to access brands (admin/owner only for now)
    const { data: userProfile, error: profileError } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !userProfile) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    // Only admins and owners can access brands list for assignment
    if (!["admin", "owner"].includes(userProfile.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    // Use the database function to get available brands
    const { data: brands, error } = await supabase.rpc("get_available_brands");

    if (error) {
      console.error("Error fetching brands:", error);
      return NextResponse.json(
        { error: "Failed to fetch brands" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      brands: brands || [],
      count: brands?.length || 0,
    });
  } catch (error) {
    console.error("Error in brands API:", error);
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
