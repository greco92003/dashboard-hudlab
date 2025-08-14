import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// Nuvemshop API configuration
const NUVEMSHOP_API_BASE_URL = "https://api.nuvemshop.com.br/v1";

// Helper function to make authenticated requests to Nuvemshop API
async function fetchNuvemshopAPI(endpoint: string, options: RequestInit = {}) {
  const accessToken = process.env.NUVEMSHOP_ACCESS_TOKEN;
  const userId = process.env.NUVEMSHOP_USER_ID;

  if (!accessToken || !userId) {
    throw new Error("Nuvemshop credentials not configured");
  }

  const url = `${NUVEMSHOP_API_BASE_URL}/${userId}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authentication: `bearer ${accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": "HudLab Dashboard (contato@hudlab.com.br)",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Nuvemshop API Error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// GET - Fetch coupons from Nuvemshop
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

    // Check if user is approved and has permission
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("approved, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.approved) {
      return NextResponse.json({ error: "User not approved" }, { status: 403 });
    }

    const allowedRoles = ["owner", "admin", "manager"];
    if (!allowedRoles.includes(profile.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const perPage = parseInt(searchParams.get("per_page") || "50");
    const valid = searchParams.get("valid");

    // Build Nuvemshop API endpoint
    let endpoint = `/coupons?page=${page}&per_page=${perPage}`;
    if (valid !== null) {
      endpoint += `&valid=${valid}`;
    }

    // Fetch coupons from Nuvemshop
    const couponsData = await fetchNuvemshopAPI(endpoint);

    return NextResponse.json({
      success: true,
      coupons: couponsData,
      message: "Coupons fetched successfully from Nuvemshop",
    });
  } catch (error) {
    console.error("Error fetching coupons from Nuvemshop:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch coupons",
      },
      { status: 500 }
    );
  }
}

// POST - Create a new coupon in Nuvemshop
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

    // Check if user is approved and has permission
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("approved, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.approved) {
      return NextResponse.json({ error: "User not approved" }, { status: 403 });
    }

    const allowedRoles = ["owner", "admin"];
    if (!allowedRoles.includes(profile.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Create coupon in Nuvemshop
    const newCoupon = await fetchNuvemshopAPI("/coupons", {
      method: "POST",
      body: JSON.stringify(body),
    });

    return NextResponse.json({
      success: true,
      coupon: newCoupon,
      message: "Coupon created successfully in Nuvemshop",
    });
  } catch (error) {
    console.error("Error creating coupon in Nuvemshop:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create coupon",
      },
      { status: 500 }
    );
  }
}
