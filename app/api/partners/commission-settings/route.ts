import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET() {
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
      .select("approved, role")
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

    // Get current commission settings
    const { data: settings, error } = await supabase
      .from("partners_commission_settings")
      .select("*")
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

    // If no settings exist, return default
    if (!settings) {
      return NextResponse.json({
        percentage: 5.0,
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
    const { percentage } = body;

    if (typeof percentage !== "number" || percentage < 0 || percentage > 100) {
      return NextResponse.json(
        { error: "Invalid percentage. Must be between 0 and 100." },
        { status: 400 }
      );
    }

    // Check if settings already exist
    const { data: existingSettings } = await supabase
      .from("partners_commission_settings")
      .select("id")
      .limit(1)
      .single();

    let result;

    if (existingSettings) {
      // Update existing settings
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
      // Create new settings
      const { data, error } = await supabase
        .from("partners_commission_settings")
        .insert({
          percentage,
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
