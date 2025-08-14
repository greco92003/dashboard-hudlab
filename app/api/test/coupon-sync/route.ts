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

// GET - Test endpoint to fetch and display coupon information
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

    console.log("Testing coupon sync - fetching data...");

    // Fetch coupons from Nuvemshop
    const nuvemshopCoupons = await fetchNuvemshopAPI("/coupons?per_page=10");
    
    // Fetch coupons from Supabase
    const { data: supabaseCoupons, error: supabaseError } = await supabase
      .from("generated_coupons")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);

    // Look for TESTE123 specifically
    const teste123Nuvemshop = Array.isArray(nuvemshopCoupons) 
      ? nuvemshopCoupons.find((c: any) => c.code === "TESTE123")
      : nuvemshopCoupons.coupons?.find((c: any) => c.code === "TESTE123");

    const teste123Supabase = supabaseCoupons?.find(c => c.code === "TESTE123");

    // Get some sample products for "Desculpa qualquer coisa" brand
    const { data: brandProducts, error: productsError } = await supabase
      .from("nuvemshop_products")
      .select("product_id, name, brand")
      .eq("brand", "Desculpa qualquer coisa")
      .eq("published", true)
      .limit(5);

    return NextResponse.json({
      success: true,
      test_results: {
        nuvemshop_coupons: {
          total: Array.isArray(nuvemshopCoupons) ? nuvemshopCoupons.length : nuvemshopCoupons.coupons?.length || 0,
          sample: Array.isArray(nuvemshopCoupons) 
            ? nuvemshopCoupons.slice(0, 3)
            : nuvemshopCoupons.coupons?.slice(0, 3) || [],
          teste123: teste123Nuvemshop || "Not found in Nuvemshop",
        },
        supabase_coupons: {
          total: supabaseCoupons?.length || 0,
          sample: supabaseCoupons?.slice(0, 3) || [],
          teste123: teste123Supabase || "Not found in Supabase",
          error: supabaseError?.message || null,
        },
        brand_products: {
          products: brandProducts || [],
          error: productsError?.message || null,
        },
      },
    });
  } catch (error) {
    console.error("Error in test endpoint:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Test failed",
        details: error instanceof Error ? error.stack : null,
      },
      { status: 500 }
    );
  }
}

// POST - Test endpoint to manually sync TESTE123 coupon
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

    console.log("Manually syncing TESTE123 coupon...");

    // Fetch TESTE123 coupon from Nuvemshop
    const nuvemshopCoupons = await fetchNuvemshopAPI("/coupons?q=TESTE123");
    const teste123Coupon = Array.isArray(nuvemshopCoupons) 
      ? nuvemshopCoupons.find((c: any) => c.code === "TESTE123")
      : nuvemshopCoupons.coupons?.find((c: any) => c.code === "TESTE123");

    if (!teste123Coupon) {
      return NextResponse.json(
        { error: "TESTE123 coupon not found in Nuvemshop" },
        { status: 404 }
      );
    }

    // Parse percentage value
    let percentage = 0;
    if (teste123Coupon.type === "percentage") {
      percentage = parseFloat(teste123Coupon.value) || 0;
    }

    // Prepare coupon data for Supabase
    const couponData = {
      code: teste123Coupon.code,
      percentage: Math.round(percentage),
      brand: "Desculpa qualquer coisa", // Based on your description
      valid_until: teste123Coupon.end_date ? new Date(teste123Coupon.end_date).toISOString() : null,
      max_uses: teste123Coupon.max_uses || 999999,
      current_uses: teste123Coupon.used || 0,
      nuvemshop_coupon_id: teste123Coupon.id.toString(),
      nuvemshop_status: "created",
      is_active: teste123Coupon.valid || false,
      created_by_brand: "Desculpa qualquer coisa",
    };

    // Check if coupon already exists
    const { data: existingCoupon } = await supabase
      .from("generated_coupons")
      .select("id")
      .eq("code", "TESTE123")
      .single();

    let result;
    if (existingCoupon) {
      // Update existing coupon
      const { data, error } = await supabase
        .from("generated_coupons")
        .update(couponData)
        .eq("id", existingCoupon.id)
        .select()
        .single();

      result = { action: "updated", coupon: data, error: error?.message };
    } else {
      // Insert new coupon
      const { data, error } = await supabase
        .from("generated_coupons")
        .insert(couponData)
        .select()
        .single();

      result = { action: "inserted", coupon: data, error: error?.message };
    }

    return NextResponse.json({
      success: !result.error,
      message: `TESTE123 coupon ${result.action} successfully`,
      nuvemshop_data: teste123Coupon,
      supabase_result: result,
    });
  } catch (error) {
    console.error("Error in manual sync:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Manual sync failed",
      },
      { status: 500 }
    );
  }
}
