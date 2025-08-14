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

// POST - Create advanced coupon with full customization
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

    if (profileError || !profile?.approved || !["admin", "owner"].includes(profile.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      code,
      type,
      value,
      brand,
      startDate,
      endDate,
      maxUses,
      minPrice,
      includesShipping,
      firstConsumerPurchase,
      combinesWithOtherDiscounts,
      restrictionType,
      selectedProducts,
    } = body;

    if (!brand) {
      return NextResponse.json({ error: "Brand is required" }, { status: 400 });
    }

    if (!type || !["percentage", "absolute", "shipping"].includes(type)) {
      return NextResponse.json({ error: "Valid type is required" }, { status: 400 });
    }

    if (type !== "shipping" && (!value || parseFloat(value) <= 0)) {
      return NextResponse.json({ error: "Valid value is required" }, { status: 400 });
    }

    console.log(`🎫 Creating advanced coupon for brand: ${brand}`);

    // Generate coupon code if not provided
    const couponCode = code || `${brand.replace(/\s+/g, '').toUpperCase()}_${Date.now()}`;

    // Prepare dates
    const validUntil = endDate ? new Date(endDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const startDateFormatted = startDate ? new Date(startDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
    const endDateFormatted = validUntil.toISOString().split("T")[0];

    // Create coupon in Supabase first
    const { data: newCoupon, error: createError } = await supabase
      .from("generated_coupons")
      .insert({
        code: couponCode,
        percentage: type === "percentage" ? parseFloat(value) : 0,
        brand: brand,
        valid_until: validUntil.toISOString(),
        max_uses: maxUses || null,
        created_by: user.id,
        created_by_brand: brand,
        nuvemshop_status: "pending",
      })
      .select()
      .single();

    if (createError) {
      console.error("Error creating coupon in database:", createError);
      return NextResponse.json(
        { error: "Failed to create coupon" },
        { status: 500 }
      );
    }

    try {
      // Prepare product IDs if restriction is by products
      let productIds: number[] = [];
      if (restrictionType === "products" && selectedProducts && selectedProducts.length > 0) {
        // Get products from database to validate they exist
        const { data: brandProducts, error: productsError } = await supabase
          .from("nuvemshop_products")
          .select("product_id")
          .eq("brand", brand)
          .eq("published", true)
          .eq("sync_status", "synced")
          .in("product_id", selectedProducts);

        if (productsError) {
          console.error("Error fetching brand products:", productsError);
        } else {
          productIds = brandProducts
            ?.map(p => {
              const id = parseInt(p.product_id, 10);
              return isNaN(id) ? null : id;
            })
            .filter(id => id !== null) || [];
        }

        console.log(`📦 Using ${productIds.length} products for coupon restriction`);
      }

      // Prepare coupon payload for Nuvemshop
      const couponPayload: any = {
        code: couponCode,
        type: type,
        valid: true,
        start_date: startDateFormatted,
        end_date: endDateFormatted,
        min_price: minPrice ? parseFloat(minPrice) : 0,
        first_consumer_purchase: !!firstConsumerPurchase,
        combines_with_other_discounts: !!combinesWithOtherDiscounts,
        includes_shipping: !!includesShipping,
      };

      // Add value for percentage and absolute types
      if (type !== "shipping") {
        couponPayload.value = value.toString();
      }

      // Add max_uses if specified
      if (maxUses) {
        couponPayload.max_uses = parseInt(maxUses);
      }

      // Add product restrictions if specified
      if (restrictionType === "products" && productIds.length > 0) {
        couponPayload.products = productIds; // Direct array of integers
      }

      console.log(`📋 Creating coupon in Nuvemshop:`, JSON.stringify(couponPayload, null, 2));

      // Create coupon in Nuvemshop
      const nuvemshopCoupon = await fetchNuvemshopAPI("/coupons", {
        method: "POST",
        body: JSON.stringify(couponPayload),
      });

      console.log(`✅ Nuvemshop coupon created: ${couponCode} (ID: ${nuvemshopCoupon.id})`);

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
        console.error(`Error updating coupon ${couponCode}:`, updateError);
      }

      return NextResponse.json({
        success: true,
        message: "Advanced coupon created successfully",
        coupon: {
          id: newCoupon.id,
          code: couponCode,
          type: type,
          value: type !== "shipping" ? value : null,
          brand: brand,
          nuvemshopId: nuvemshopCoupon.id,
          restrictionType: restrictionType,
          productCount: productIds.length,
        },
        nuvemshopCoupon: nuvemshopCoupon,
      });

    } catch (nuvemshopError) {
      console.error(`❌ Failed to create coupon in Nuvemshop:`, nuvemshopError);

      // Update coupon status to error
      await supabase
        .from("generated_coupons")
        .update({
          nuvemshop_status: "error",
          nuvemshop_error: nuvemshopError instanceof Error ? nuvemshopError.message : "Unknown error",
        })
        .eq("id", newCoupon.id);

      return NextResponse.json({
        success: false,
        error: nuvemshopError instanceof Error ? nuvemshopError.message : "Failed to create coupon in Nuvemshop",
        coupon: {
          id: newCoupon.id,
          code: couponCode,
          status: "error",
        },
      }, { status: 500 });
    }

  } catch (error) {
    console.error("Error in advanced coupon creation:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
