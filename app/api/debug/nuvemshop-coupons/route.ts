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

// GET - Debug endpoint to fetch and analyze Nuvemshop coupons
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

    const allowedRoles = ["owner", "admin"];
    if (!allowedRoles.includes(profile.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    console.log("Fetching coupons from Nuvemshop for debugging...");

    // Fetch all coupons to find TESTE123
    const allCoupons = await fetchNuvemshopAPI("/coupons?per_page=100");
    
    // Look for TESTE123 specifically
    const teste123Coupon = Array.isArray(allCoupons) 
      ? allCoupons.find((c: any) => c.code === "TESTE123")
      : allCoupons.coupons?.find((c: any) => c.code === "TESTE123");

    // Also get some sample products for "Desculpa qualquer coisa" brand
    const { data: brandProducts, error: productsError } = await supabase
      .from("nuvemshop_products")
      .select("product_id, name, brand")
      .eq("brand", "Desculpa qualquer coisa")
      .eq("published", true)
      .limit(5);

    return NextResponse.json({
      success: true,
      debug_info: {
        teste123_coupon: teste123Coupon || "Not found",
        all_coupons_count: Array.isArray(allCoupons) ? allCoupons.length : allCoupons.coupons?.length || 0,
        sample_coupons: Array.isArray(allCoupons) 
          ? allCoupons.slice(0, 3)
          : allCoupons.coupons?.slice(0, 3) || [],
        brand_products: brandProducts || [],
        products_error: productsError?.message || null,
      },
    });
  } catch (error) {
    console.error("Error in debug endpoint:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Debug failed",
        details: error instanceof Error ? error.stack : null,
      },
      { status: 500 }
    );
  }
}
