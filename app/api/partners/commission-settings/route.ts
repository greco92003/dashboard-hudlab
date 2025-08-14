import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication for GET requests
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is approved and has permission to view commission settings
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("approved, role, assigned_brand")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.approved) {
      return NextResponse.json({ error: "User not approved" }, { status: 403 });
    }

    // Allow partners-media to view commission settings (read-only)
    // Users with role "user" cannot access partners data
    const allowedRoles = ["owner", "admin", "manager", "partners-media"];
    if (!allowedRoles.includes(profile.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const requestedBrand = searchParams.get("brand");

    // Determine which brand to get settings for
    let targetBrand: string | null = null;

    if (profile.role === "partners-media") {
      // Partners-media can only see their assigned brand
      if (!profile.assigned_brand) {
        return NextResponse.json(
          { error: "No brand assigned" },
          { status: 403 }
        );
      }
      targetBrand = profile.assigned_brand;
    } else if (requestedBrand) {
      // Owners/admins can request specific brand
      targetBrand = requestedBrand;
    } else {
      // If no brand specified, return error for owners/admins
      return NextResponse.json(
        { error: "Brand parameter is required" },
        { status: 400 }
      );
    }

    // Get commission settings for the specific brand
    const { data: settings, error } = await supabase
      .from("partners_commission_settings")
      .select("*")
      .eq("brand", targetBrand)
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching commission settings:", error);
      return NextResponse.json(
        { error: "Failed to fetch commission settings" },
        { status: 500 }
      );
    }

    // If no settings exist for this brand, return default
    if (!settings) {
      return NextResponse.json({
        percentage: 5.0,
        brand: targetBrand,
        updated_by: null,
        updated_at: null,
        created_at: null,
      });
    }

    return NextResponse.json(settings);
  } catch (error) {
    console.error("Error in commission settings GET:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin or owner
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("role, approved")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    if (!profile.approved || !["admin", "owner"].includes(profile.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { percentage, brand } = body;

    if (typeof percentage !== "number" || percentage < 0 || percentage > 100) {
      return NextResponse.json(
        { error: "Invalid percentage. Must be between 0 and 100." },
        { status: 400 }
      );
    }

    if (!brand || typeof brand !== "string") {
      return NextResponse.json(
        { error: "Brand is required and must be a string." },
        { status: 400 }
      );
    }

    // Check if settings already exist for this brand
    const { data: existingSettings } = await supabase
      .from("partners_commission_settings")
      .select("id")
      .eq("brand", brand)
      .limit(1)
      .single();

    let result;

    if (existingSettings) {
      // Update existing settings for this brand
      const { data, error } = await supabase
        .from("partners_commission_settings")
        .update({
          percentage,
          updated_by: user.id,
        })
        .eq("id", existingSettings.id)
        .select()
        .single();

      if (error) {
        console.error("Error updating commission settings:", error);
        return NextResponse.json(
          { error: "Failed to update commission settings" },
          { status: 500 }
        );
      }

      result = data;
    } else {
      // Create new settings for this brand
      const { data, error } = await supabase
        .from("partners_commission_settings")
        .insert({
          percentage,
          brand,
          updated_by: user.id,
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating commission settings:", error);
        return NextResponse.json(
          { error: "Failed to create commission settings" },
          { status: 500 }
        );
      }

      result = data;
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in commission settings POST:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
