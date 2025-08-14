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

// POST - Test coupon creation with different approaches
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

    if (
      profileError ||
      !profile?.approved ||
      !["admin", "owner"].includes(profile.role)
    ) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { brand, testType = "products" } = body;

    if (!brand) {
      return NextResponse.json({ error: "Brand is required" }, { status: 400 });
    }

    console.log(
      `🧪 Testing coupon creation for brand: ${brand} with type: ${testType}`
    );

    // Get products for the selected brand
    const { data: brandProducts, error: productsError } = await supabase
      .from("nuvemshop_products")
      .select("product_id, name_pt, published, sync_status")
      .eq("brand", brand)
      .eq("published", true)
      .eq("sync_status", "synced");

    if (productsError) {
      console.error("Error fetching brand products:", productsError);
      return NextResponse.json(
        { error: "Failed to fetch brand products" },
        { status: 500 }
      );
    }

    console.log(
      `📦 Found ${brandProducts?.length || 0} products for brand ${brand}:`,
      brandProducts
    );

    // Convert product IDs to integers with detailed logging
    const productIds =
      brandProducts
        ?.map((p) => {
          console.log(
            `🔍 Processing product_id: "${
              p.product_id
            }" (type: ${typeof p.product_id})`
          );
          const id = parseInt(p.product_id, 10);
          console.log(
            `🔢 Converted to: ${id} (type: ${typeof id}, isNaN: ${isNaN(id)})`
          );
          return isNaN(id) ? null : id;
        })
        .filter((id) => id !== null) || [];

    console.log(`🔢 Final valid product IDs:`, productIds);
    console.log(
      `🔢 Product IDs types:`,
      productIds.map((id) => typeof id)
    );

    const testCouponCode = `TEST_${brand
      .replace(/\s+/g, "")
      .toUpperCase()}_${Date.now()}`;

    let couponPayload;
    let testDescription;

    switch (testType) {
      case "store":
        // Test 1: Store-wide coupon (no restrictions)
        couponPayload = {
          code: testCouponCode,
          type: "percentage",
          value: "5",
          valid: true,
          max_uses: 1,
          start_date: new Date().toISOString().split("T")[0],
          end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0], // 7 days
          min_price: 0,
          first_consumer_purchase: false,
          combines_with_other_discounts: false,
          includes_shipping: false,
        };
        testDescription = "Store-wide coupon (no product restrictions)";
        break;

      case "products":
        // Test 2: Product-specific coupon
        if (productIds.length === 0) {
          return NextResponse.json(
            {
              error: "No valid products found for this brand",
              brandProducts: brandProducts,
            },
            { status: 400 }
          );
        }

        couponPayload = {
          code: testCouponCode,
          type: "percentage",
          value: "5",
          valid: true,
          max_uses: 1,
          start_date: new Date().toISOString().split("T")[0],
          end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0], // 7 days
          min_price: 0,
          first_consumer_purchase: false,
          combines_with_other_discounts: false,
          includes_shipping: false,
          products: productIds, // Direct array of integers, not objects
        };
        testDescription = `Product-specific coupon (${productIds.length} products)`;
        break;

      case "single_product":
        // Test 3: Single product coupon
        if (productIds.length === 0) {
          return NextResponse.json(
            {
              error: "No valid products found for this brand",
              brandProducts: brandProducts,
            },
            { status: 400 }
          );
        }

        couponPayload = {
          code: testCouponCode,
          type: "percentage",
          value: "5",
          valid: true,
          max_uses: 1,
          start_date: new Date().toISOString().split("T")[0],
          end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0], // 7 days
          min_price: 0,
          first_consumer_purchase: false,
          combines_with_other_discounts: false,
          includes_shipping: false,
          products: [productIds[0]], // Only first product - direct integer
        };
        testDescription = `Single product coupon (product ID: ${productIds[0]})`;
        break;

      default:
        return NextResponse.json(
          { error: "Invalid test type" },
          { status: 400 }
        );
    }

    console.log(`🎯 Testing: ${testDescription}`);
    console.log(`📋 Payload:`, JSON.stringify(couponPayload, null, 2));

    try {
      // Create test coupon in Nuvemshop
      const nuvemshopCoupon = await fetchNuvemshopAPI("/coupons", {
        method: "POST",
        body: JSON.stringify(couponPayload),
      });

      console.log(`✅ Success! Coupon created:`, nuvemshopCoupon);

      return NextResponse.json({
        success: true,
        message: `${testDescription} created successfully!`,
        coupon: {
          code: testCouponCode,
          nuvemshopId: nuvemshopCoupon.id,
          testType: testType,
          brand: brand,
          productCount: productIds.length,
        },
        debug: {
          brandProducts: brandProducts,
          productIds: productIds,
          payload: couponPayload,
          nuvemshopResponse: nuvemshopCoupon,
        },
      });
    } catch (nuvemshopError) {
      console.error(`❌ Failed to create ${testDescription}:`, nuvemshopError);

      return NextResponse.json(
        {
          success: false,
          error:
            nuvemshopError instanceof Error
              ? nuvemshopError.message
              : "Unknown error",
          testType: testType,
          debug: {
            brandProducts: brandProducts,
            productIds: productIds,
            payload: couponPayload,
          },
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error in coupon creation test:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
