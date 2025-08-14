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

// POST - Create auto-coupon in Nuvemshop for a brand
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // This is an internal API, but we still need basic validation
    const body = await request.json();
    const { couponCode, brand, couponId } = body;

    if (!couponCode || !brand || !couponId) {
      return NextResponse.json(
        { error: "Missing required fields: couponCode, brand, couponId" },
        { status: 400 }
      );
    }

    console.log(
      `🤖 Creating auto-coupon in Nuvemshop: ${couponCode} for brand: ${brand}`
    );

    try {
      // Get products for this brand to apply coupon restrictions
      const { data: brandProducts, error: productsError } = await supabase
        .from("nuvemshop_products")
        .select("product_id")
        .eq("brand", brand)
        .eq("published", true)
        .eq("sync_status", "synced");

      if (productsError) {
        console.error("Error fetching brand products:", productsError);
      }

      const productIds =
        brandProducts?.map((p) => parseInt(p.product_id)) || [];

      // Prepare dates in the same format as the working button logic
      const startDate = new Date().toISOString().split("T")[0];
      const endDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

      // Prepare coupon payload for Nuvemshop (using same logic as working button)
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
        `📦 Creating coupon with ${productIds.length} product restrictions`
      );

      // Create coupon in Nuvemshop
      const nuvemshopCoupon = await fetchNuvemshopAPI("/coupons", {
        method: "POST",
        body: JSON.stringify(couponPayload),
      });

      console.log(
        `✅ Nuvemshop coupon created successfully: ID ${nuvemshopCoupon.id}`
      );

      // Update the coupon in Supabase with Nuvemshop ID
      const { error: updateError } = await supabase
        .from("generated_coupons")
        .update({
          nuvemshop_coupon_id: nuvemshopCoupon.id.toString(),
          nuvemshop_status: "created",
        })
        .eq("id", couponId);

      if (updateError) {
        console.error("Error updating coupon with Nuvemshop ID:", updateError);
        // Don't fail the request, just log the error
      }

      return NextResponse.json({
        success: true,
        nuvemshopId: nuvemshopCoupon.id,
        message: "Auto-coupon created successfully in Nuvemshop",
      });
    } catch (nuvemshopError) {
      console.error("Error creating auto-coupon in Nuvemshop:", nuvemshopError);

      // Update coupon status to error in Supabase
      await supabase
        .from("generated_coupons")
        .update({
          nuvemshop_status: "error",
          nuvemshop_error:
            nuvemshopError instanceof Error
              ? nuvemshopError.message
              : "Unknown error",
        })
        .eq("id", couponId);

      // Don't fail the entire process - the coupon exists in Supabase
      return NextResponse.json(
        {
          success: false,
          error:
            nuvemshopError instanceof Error
              ? nuvemshopError.message
              : "Unknown error",
          message:
            "Coupon created in database but failed to create in Nuvemshop",
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error in auto-coupon Nuvemshop creation:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET - Check status of auto-coupon system
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get statistics about auto-coupons
    const { data: stats, error: statsError } = await supabase
      .from("generated_coupons")
      .select("nuvemshop_status, brand")
      .like("code", "%-15"); // Auto-coupons end with "-15"

    if (statsError) {
      console.error("Error fetching auto-coupon stats:", statsError);
      return NextResponse.json(
        { error: "Failed to fetch stats" },
        { status: 500 }
      );
    }

    const statusCounts =
      stats?.reduce((acc, coupon) => {
        acc[coupon.nuvemshop_status] = (acc[coupon.nuvemshop_status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};

    const brandCounts =
      stats?.reduce((acc, coupon) => {
        acc[coupon.brand] = (acc[coupon.brand] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};

    return NextResponse.json({
      success: true,
      stats: {
        total: stats?.length || 0,
        byStatus: statusCounts,
        byBrand: brandCounts,
      },
      message: "Auto-coupon system status retrieved",
    });
  } catch (error) {
    console.error("Error checking auto-coupon system status:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
