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

// POST - Manually trigger auto-generation for a specific brand
export async function POST(request: NextRequest) {
  try {
    // Check for service role authentication (for webhook calls)
    const authHeader = request.headers.get("authorization");
    const isServiceRole =
      authHeader === `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`;

    let supabase;
    let user = null;

    if (isServiceRole) {
      // Use service role client for webhook calls
      const { createClient } = await import("@supabase/supabase-js");
      supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      console.log("🔧 Using service role authentication for webhook call");
    } else {
      // Use regular client for user calls
      supabase = await createClient();

      // Check user authentication
      const {
        data: { user: authUser },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !authUser) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      user = authUser;

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
    }

    // Parse request body
    const body = await request.json();
    const { brand } = body;

    // Validate required fields
    if (!brand) {
      return NextResponse.json({ error: "Brand is required" }, { status: 400 });
    }

    console.log(`🎫 Auto-generating coupon for brand: ${brand}`);

    // Generate coupon code (first word of brand + "15", all uppercase)
    const firstWord = brand.trim().split(/\s+/)[0];
    const couponCode = `${firstWord.toUpperCase()}15`;

    // Check if auto-coupon already exists for this brand
    const { data: existingCoupon, error: checkError } = await supabase
      .from("generated_coupons")
      .select("id, code, nuvemshop_coupon_id")
      .eq("brand", brand)
      .like("code", "%15")
      .single();

    if (checkError && checkError.code !== "PGRST116") {
      console.error("Error checking existing auto-coupon:", checkError);
      return NextResponse.json(
        { error: "Failed to check existing auto-coupon" },
        { status: 500 }
      );
    }

    if (existingCoupon) {
      console.log(
        `Auto-coupon already exists for brand ${brand}: ${existingCoupon.code}`
      );
      return NextResponse.json({
        success: true,
        message: "Auto-coupon already exists",
        coupon: {
          code: existingCoupon.code,
          id: existingCoupon.id,
          brand: brand,
          percentage: 15,
          nuvemshopId: existingCoupon.nuvemshop_coupon_id,
        },
      });
    }

    // Get products for this brand to apply coupon restrictions
    const { data: brandProducts, error: productsError } = await supabase
      .from("nuvemshop_products")
      .select("product_id")
      .eq("brand", brand)
      .eq("published", true)
      .eq("sync_status", "synced");

    if (productsError) {
      console.error(
        `Error fetching products for brand ${brand}:`,
        productsError
      );
    }

    const productIds =
      brandProducts
        ?.map((p) => {
          const id = parseInt(p.product_id, 10);
          return isNaN(id) ? null : id;
        })
        .filter((id) => id !== null) || [];

    console.log(`📦 Found ${productIds.length} products for brand ${brand}`);

    // Prepare dates
    const startDate = new Date().toISOString().split("T")[0];
    const endDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    // Create coupon in Supabase first
    const { data: newCoupon, error: createError } = await supabase
      .from("generated_coupons")
      .insert({
        code: couponCode,
        percentage: 15,
        brand: brand,
        valid_until: new Date(
          Date.now() + 365 * 24 * 60 * 60 * 1000
        ).toISOString(),
        max_uses: null, // Unlimited uses
        created_by: user?.id || null,
        created_by_brand: brand,
        nuvemshop_status: "pending",
        is_auto_generated: true, // Mark as auto-generated
      })
      .select()
      .single();

    if (createError) {
      console.error("Error creating auto-coupon in database:", createError);
      return NextResponse.json(
        { error: "Failed to create auto-coupon" },
        { status: 500 }
      );
    }

    try {
      // Prepare coupon payload for Nuvemshop
      const couponPayload = {
        code: couponCode,
        type: "percentage",
        value: "15",
        valid: true,
        start_date: startDate,
        end_date: endDate,
        min_price: 0,
        first_consumer_purchase: false,
        combines_with_other_discounts: false,
        includes_shipping: false,
        // Include products if we have them, otherwise create a general coupon
        ...(productIds.length > 0 && { products: productIds }),
      };

      console.log(
        `📋 Creating auto-coupon in Nuvemshop:`,
        JSON.stringify(couponPayload, null, 2)
      );

      // Create coupon in Nuvemshop
      const nuvemshopCoupon = await fetchNuvemshopAPI("/coupons", {
        method: "POST",
        body: JSON.stringify(couponPayload),
      });

      console.log(
        `✅ Nuvemshop auto-coupon created: ${couponCode} (ID: ${nuvemshopCoupon.id})`
      );

      // Update the coupon in Supabase with Nuvemshop ID
      const { error: updateError } = await supabase
        .from("generated_coupons")
        .update({
          nuvemshop_coupon_id: nuvemshopCoupon.id.toString(),
          nuvemshop_status: "created",
          nuvemshop_error: null,
        })
        .eq("id", newCoupon.id);

      if (updateError) {
        console.error(`Error updating auto-coupon ${couponCode}:`, updateError);
      }

      return NextResponse.json(
        {
          success: true,
          message: "Auto-coupon created successfully in Nuvemshop",
          coupon: {
            code: couponCode,
            id: newCoupon.id,
            brand: brand,
            percentage: 15,
            nuvemshopId: nuvemshopCoupon.id,
            productCount: productIds.length,
          },
        },
        { status: 201 }
      );
    } catch (nuvemshopError) {
      console.error(
        `❌ Failed to create auto-coupon in Nuvemshop:`,
        nuvemshopError
      );

      // Update coupon status to error
      await supabase
        .from("generated_coupons")
        .update({
          nuvemshop_status: "error",
          nuvemshop_error:
            nuvemshopError instanceof Error
              ? nuvemshopError.message
              : "Unknown error",
        })
        .eq("id", newCoupon.id);

      return NextResponse.json(
        {
          success: false,
          error:
            nuvemshopError instanceof Error
              ? nuvemshopError.message
              : "Failed to create auto-coupon in Nuvemshop",
          coupon: {
            code: couponCode,
            id: newCoupon.id,
            status: "error",
          },
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error in auto-generate coupon POST:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET - Get list of brands that can have auto-coupons generated
export async function GET() {
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

    // Check if user has permission to view brands
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

    // Get brands that have published products but no auto-generated coupons
    const { data: brandsWithoutCoupons, error: brandsError } = await supabase
      .from("nuvemshop_products")
      .select("brand")
      .eq("published", true)
      .eq("sync_status", "synced")
      .not("brand", "is", null)
      .neq("brand", "");

    if (brandsError) {
      console.error("Error fetching brands:", brandsError);
      return NextResponse.json(
        { error: "Failed to fetch brands" },
        { status: 500 }
      );
    }

    // Get existing auto-generated coupons
    const { data: existingCoupons, error: couponsError } = await supabase
      .from("generated_coupons")
      .select("brand")
      .eq("is_active", true)
      .like("code", "%-15");

    if (couponsError) {
      console.error("Error fetching existing coupons:", couponsError);
      return NextResponse.json(
        { error: "Failed to fetch existing coupons" },
        { status: 500 }
      );
    }

    // Filter brands that don't have auto-coupons yet
    const existingCouponBrands = new Set(
      existingCoupons?.map((c) => c.brand) || []
    );
    const uniqueBrands = [
      ...new Set(brandsWithoutCoupons?.map((p) => p.brand) || []),
    ];
    const availableBrands = uniqueBrands.filter(
      (brand) => !existingCouponBrands.has(brand)
    );

    return NextResponse.json({
      success: true,
      availableBrands: availableBrands,
      totalBrands: uniqueBrands.length,
      brandsWithCoupons: existingCouponBrands.size,
      brandsWithoutCoupons: availableBrands.length,
    });
  } catch (error) {
    console.error("Error in auto-generate coupon GET:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
