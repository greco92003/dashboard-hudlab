import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

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

    // Check if user is approved and has permission to generate coupons
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("approved, role, assigned_brand")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.approved) {
      return NextResponse.json({ error: "User not approved" }, { status: 403 });
    }

    // Only owners and admins can generate coupons
    if (!["owner", "admin"].includes(profile.role)) {
      return NextResponse.json(
        { error: "Only owners and admins can generate coupons" },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { percentage, validDays, maxUses, brand } = body;

    // Validate input
    if (!percentage || !validDays || !maxUses || !brand) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (percentage > 15 || percentage < 1) {
      return NextResponse.json(
        { error: "Percentage must be between 1 and 15" },
        { status: 400 }
      );
    }

    // Generate unique coupon code
    const { data: generatedCode, error: codeError } = await supabase.rpc(
      "generate_coupon_code",
      {
        brand_name: brand,
        percentage: percentage,
      }
    );

    if (codeError || !generatedCode) {
      console.error("Error generating coupon code:", codeError);
      return NextResponse.json(
        { error: "Failed to generate coupon code" },
        { status: 500 }
      );
    }

    const couponCode = generatedCode;

    // Calculate valid until date
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + validDays);

    // Get products for the brand to apply coupon restrictions
    const { data: brandProducts, error: productsError } = await supabase
      .from("nuvemshop_products")
      .select("product_id")
      .eq("brand", brand)
      .eq("published", true);

    if (productsError) {
      console.error("Error fetching brand products:", productsError);
      return NextResponse.json(
        { error: "Failed to fetch brand products" },
        { status: 500 }
      );
    }

    const productIds = (brandProducts || [])
      .map((p) => parseInt(p.product_id))
      .filter((id) => !isNaN(id));

    if (productIds.length === 0) {
      return NextResponse.json(
        { error: "No published products found for this brand" },
        { status: 400 }
      );
    }

    // Create coupon in our database first
    const { data: newCoupon, error: createError } = await supabase
      .from("generated_coupons")
      .insert({
        code: couponCode,
        percentage: percentage,
        brand: brand,
        valid_until: validUntil.toISOString(),
        max_uses: maxUses,
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

    // Prepare coupon payload for Nuvemshop API according to documentation
    const couponPayload = {
      code: couponCode,
      type: "percentage",
      value: percentage.toString(),
      valid: true,
      max_uses: maxUses,
      start_date: new Date().toISOString().split("T")[0],
      end_date: validUntil.toISOString().split("T")[0],
      min_price: 0,
      first_consumer_purchase: false,
      combines_with_other_discounts: false,
      includes_shipping: false,
      // Products array - direct integers as per Nuvemshop API docs
      products: productIds,
    };

    try {
      console.log(
        "Creating coupon in Nuvemshop with payload:",
        JSON.stringify(couponPayload, null, 2)
      );

      let nuvemshopCoupon;

      try {
        // Try to create coupon with product restrictions first
        nuvemshopCoupon = await fetchNuvemshopAPI("/coupons", {
          method: "POST",
          body: JSON.stringify(couponPayload),
        });
      } catch (productError) {
        console.warn(
          "Failed to create coupon with product restrictions, trying without products:",
          productError
        );

        // Fallback: Create coupon without product restrictions
        const { products, ...fallbackPayload } = couponPayload;

        console.log(
          "Retrying with fallback payload:",
          JSON.stringify(fallbackPayload, null, 2)
        );

        nuvemshopCoupon = await fetchNuvemshopAPI("/coupons", {
          method: "POST",
          body: JSON.stringify(fallbackPayload),
        });
      }

      console.log("Nuvemshop coupon created successfully:", nuvemshopCoupon);

      // Update coupon with Nuvemshop ID
      const { error: updateError } = await supabase
        .from("generated_coupons")
        .update({
          nuvemshop_coupon_id: nuvemshopCoupon.id.toString(),
          nuvemshop_status: "created",
        })
        .eq("id", newCoupon.id);

      if (updateError) {
        console.error("Error updating coupon with Nuvemshop ID:", updateError);
        // Don't fail the request, just log the error
      }

      return NextResponse.json(
        {
          success: true,
          coupon: {
            code: couponCode,
            percentage: percentage,
            validUntil: validUntil.toISOString(),
            maxUses: maxUses,
            brand: brand,
            nuvemshopId: nuvemshopCoupon.id,
          },
        },
        { status: 201 }
      );
    } catch (nuvemshopError) {
      console.error("Error creating coupon in Nuvemshop:", nuvemshopError);
      console.error(
        "Coupon payload that failed:",
        JSON.stringify(couponPayload, null, 2)
      );

      // Extract more detailed error information
      let errorMessage = "Unknown error";
      let errorDetails = "";

      if (nuvemshopError instanceof Error) {
        errorMessage = nuvemshopError.message;
        errorDetails = nuvemshopError.stack || "";
      }

      // Update coupon status to error
      await supabase
        .from("generated_coupons")
        .update({
          nuvemshop_status: "error",
          nuvemshop_error: errorMessage,
        })
        .eq("id", newCoupon.id);

      return NextResponse.json(
        {
          error: `Failed to create coupon in Nuvemshop: ${errorMessage}`,
          details: errorDetails,
          payload: couponPayload,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error in coupon generation:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
