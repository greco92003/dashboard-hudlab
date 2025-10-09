import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const brand = searchParams.get("brand");
    const franchise = searchParams.get("franchise");

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user profile to check permissions
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("role, assigned_brand")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    // Check if user has permission to access partners data
    const allowedRoles = ["owner", "admin", "manager", "partners-media"];
    if (!allowedRoles.includes(profile.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    // Build query
    let query = supabase
      .from("partner_pix_keys")
      .select("*")
      .order("created_at", { ascending: false });

    // Apply brand filter based on user role and request
    if (profile.role === "partners-media") {
      // Partners-media can only see their assigned brand
      if (profile.assigned_brand) {
        query = query.eq("brand", profile.assigned_brand);
      } else {
        // Partners-media without assigned brand can't see any pix keys
        return NextResponse.json({ pixKeys: [] });
      }
    } else if (brand && brand !== "all") {
      // Owners/admins can filter by specific brand
      query = query.eq("brand", brand);
    }
    // If no brand filter and user is owner/admin, return all pix keys

    // Apply franchise filter for Zenith
    if (franchise) {
      query = query.eq("franchise", franchise);
    }

    const { data: pixKeys, error } = await query;

    if (error) {
      console.error("Error fetching pix keys:", error);
      return NextResponse.json(
        { error: "Failed to fetch pix keys" },
        { status: 500 }
      );
    }

    return NextResponse.json({ pixKeys: pixKeys || [] });
  } catch (error) {
    console.error("Error in GET /api/partners/pix-keys:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { pix_key, brand, pix_type = "random", franchise } = body;

    if (!pix_key || !brand) {
      return NextResponse.json(
        { error: "pix_key and brand are required" },
        { status: 400 }
      );
    }

    // Validate pix_type
    const validPixTypes = ["cpf", "cnpj", "email", "phone", "random"];
    if (!validPixTypes.includes(pix_type)) {
      return NextResponse.json(
        {
          error:
            "Invalid pix_type. Must be one of: " + validPixTypes.join(", "),
        },
        { status: 400 }
      );
    }

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user profile to check permissions
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("role, assigned_brand")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    // Check permissions based on role
    if (profile.role === "partners-media") {
      // Partners-media can only create for their assigned brand
      if (!profile.assigned_brand || profile.assigned_brand !== brand) {
        return NextResponse.json(
          {
            error:
              "Partners-media can only create pix keys for their assigned brand",
          },
          { status: 403 }
        );
      }
    } else if (!["owner", "admin"].includes(profile.role)) {
      // Only owners, admins, and partners-media can create pix keys
      return NextResponse.json(
        { error: "Insufficient permissions to create pix keys" },
        { status: 403 }
      );
    }

    // Check if pix key already exists for this brand + franchise combination
    const isZenith = brand.toLowerCase().trim() === "zenith";

    let existingPixKeyQuery = supabase
      .from("partner_pix_keys")
      .select("id, franchise")
      .eq("brand", brand);

    // For Zenith with franchise, check brand + franchise combination
    if (isZenith && franchise) {
      existingPixKeyQuery = existingPixKeyQuery.eq("franchise", franchise);
    }

    const { data: existingPixKeys } = await existingPixKeyQuery;

    // For Zenith: allow multiple pix keys (one per franchise)
    // For other brands: only one pix key allowed
    if (!isZenith && existingPixKeys && existingPixKeys.length > 0) {
      return NextResponse.json(
        { error: "Pix key already exists for this brand" },
        { status: 409 }
      );
    }

    // For Zenith: check if pix key exists for this specific franchise
    if (
      isZenith &&
      franchise &&
      existingPixKeys &&
      existingPixKeys.length > 0
    ) {
      return NextResponse.json(
        { error: `Pix key already exists for Zenith - ${franchise}` },
        { status: 409 }
      );
    }

    // Create new pix key
    const pixKeyData: any = {
      pix_key,
      brand,
      pix_type,
      created_by: user.id,
      updated_by: user.id,
    };

    // Add franchise for Zenith
    if (isZenith && franchise) {
      pixKeyData.franchise = franchise;
    }

    const { data: pixKey, error } = await supabase
      .from("partner_pix_keys")
      .insert(pixKeyData)
      .select()
      .single();

    if (error) {
      console.error("Error creating pix key:", error);
      return NextResponse.json(
        { error: "Failed to create pix key" },
        { status: 500 }
      );
    }

    return NextResponse.json({ pixKey }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/partners/pix-keys:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
