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
      .from("partnership_contracts")
      .select("*")
      .order("created_at", { ascending: false });

    // Apply brand filter based on user role and request
    if (profile.role === "partners-media") {
      // Partners-media can only see their assigned brand
      if (profile.assigned_brand) {
        query = query.eq("brand", profile.assigned_brand);
      } else {
        // Partners-media without assigned brand can't see any contracts
        return NextResponse.json({ contracts: [] });
      }
    } else if (brand && brand !== "all") {
      // Owners/admins can filter by specific brand
      query = query.eq("brand", brand);
    }
    // If no brand filter and user is owner/admin, return all contracts

    // Apply franchise filter for Zenith
    if (franchise) {
      query = query.eq("franchise", franchise);
    }

    const { data: contracts, error } = await query;

    if (error) {
      console.error("Error fetching contracts:", error);
      return NextResponse.json(
        { error: "Failed to fetch contracts" },
        { status: 500 }
      );
    }

    return NextResponse.json({ contracts: contracts || [] });
  } catch (error) {
    console.error("Error in GET /api/partners/contracts:", error);
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
    const { contract_url, brand, franchise } = body;

    if (!contract_url || !brand) {
      return NextResponse.json(
        { error: "contract_url and brand are required" },
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
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    // Only owners and admins can create contracts
    if (!["owner", "admin"].includes(profile.role)) {
      return NextResponse.json(
        { error: "Only owners and admins can create contracts" },
        { status: 403 }
      );
    }

    // Validate URL format
    try {
      new URL(contract_url);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 }
      );
    }

    // Check if contract already exists for this brand + franchise combination
    const isZenith = brand.toLowerCase().trim() === "zenith";

    let existingContractQuery = supabase
      .from("partnership_contracts")
      .select("id, franchise")
      .eq("brand", brand);

    // For Zenith with franchise, check brand + franchise combination
    if (isZenith && franchise) {
      existingContractQuery = existingContractQuery.eq("franchise", franchise);
    }

    const { data: existingContracts } = await existingContractQuery;

    // For Zenith: allow multiple contracts (one per franchise)
    // For other brands: only one contract allowed
    if (!isZenith && existingContracts && existingContracts.length > 0) {
      return NextResponse.json(
        { error: "Contract already exists for this brand" },
        { status: 409 }
      );
    }

    // For Zenith: check if contract exists for this specific franchise
    if (
      isZenith &&
      franchise &&
      existingContracts &&
      existingContracts.length > 0
    ) {
      return NextResponse.json(
        { error: `Contract already exists for Zenith - ${franchise}` },
        { status: 409 }
      );
    }

    // Create new contract
    const contractData: any = {
      contract_url,
      brand,
      created_by: user.id,
      updated_by: user.id,
    };

    // Add franchise for Zenith
    if (isZenith && franchise) {
      contractData.franchise = franchise;
    }

    const { data: contract, error } = await supabase
      .from("partnership_contracts")
      .insert(contractData)
      .select()
      .single();

    if (error) {
      console.error("Error creating contract:", error);
      return NextResponse.json(
        { error: "Failed to create contract" },
        { status: 500 }
      );
    }

    return NextResponse.json({ contract }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/partners/contracts:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
