import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: NextRequest) {
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

    // Check if user is approved and has permission to view affiliate links
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("approved, role, assigned_brand")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.approved) {
      return NextResponse.json({ error: "User not approved" }, { status: 403 });
    }

    // Check if user has permission to view affiliate links
    // Users with role "user" cannot access partners data
    const allowedRoles = ["owner", "admin", "manager", "partners-media"];
    if (!allowedRoles.includes(profile.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    // Get brand filter from query parameters
    const { searchParams } = new URL(request.url);
    const brandFilter = searchParams.get("brand");

    // Build query for affiliate links
    let query = supabase
      .from("affiliate_links")
      .select(
        `
        id,
        url,
        brand,
        created_at,
        updated_at
      `
      )
      .eq("is_active", true);

    // Apply brand filtering based on user role and request
    if (profile.role === "partners-media") {
      // Partners-media can only see links for their assigned brand
      if (profile.assigned_brand) {
        query = query.eq("brand", profile.assigned_brand);
      } else {
        // No assigned brand, return empty result
        return NextResponse.json({
          success: true,
          links: [],
        });
      }
    } else if (brandFilter && brandFilter !== "all") {
      // Owners/admins can filter by specific brand
      query = query.eq("brand", brandFilter);
    }
    // If no brand filter for owners/admins, return all links

    query = query.order("created_at", { ascending: false });

    const { data: links, error: linksError } = await query;

    if (linksError) {
      console.error("Error fetching affiliate links:", linksError);
      return NextResponse.json(
        { error: "Failed to fetch affiliate links" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      links: links || [],
    });
  } catch (error) {
    console.error("Error in affiliate links GET:", error);
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
    const { url, brand } = body;

    // Validate required fields
    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    if (!brand) {
      return NextResponse.json({ error: "Brand is required" }, { status: 400 });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 }
      );
    }

    // Check if there's already an active link for this brand
    const { data: existingLinks, error: checkError } = await supabase
      .from("affiliate_links")
      .select("id")
      .eq("is_active", true)
      .eq("brand", brand);

    if (checkError) {
      console.error("Error checking existing links:", checkError);
      return NextResponse.json(
        { error: "Failed to check existing links" },
        { status: 500 }
      );
    }

    if (existingLinks && existingLinks.length > 0) {
      return NextResponse.json(
        {
          error: `Já existe um link de afiliado ativo para a marca "${brand}". Por favor, edite o existente.`,
        },
        { status: 400 }
      );
    }

    // Create affiliate link
    const { data: newLink, error: createError } = await supabase
      .from("affiliate_links")
      .insert({
        url: url.trim(),
        brand: brand.trim(),
        created_by: user.id,
        is_active: true,
      })
      .select(
        `
        id,
        url,
        brand,
        created_at,
        updated_at
      `
      )
      .single();

    if (createError) {
      console.error("Error creating affiliate link:", createError);
      console.error("Create error details:", {
        code: createError.code,
        message: createError.message,
        details: createError.details,
        hint: createError.hint,
        userId: user.id,
        userRole: profile.role,
        userApproved: profile.approved,
        brand: brand,
      });
      return NextResponse.json(
        {
          error: "Failed to create affiliate link",
          details: createError.message,
          code: createError.code,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        link: newLink,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in affiliate links POST:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
