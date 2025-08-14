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

// POST - Generate coupon (create-only version without sync dependencies)
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
      .select("approved, role, assigned_brand")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.approved) {
      return NextResponse.json({ error: "User not approved" }, { status: 403 });
    }

    const isOwnerOrAdmin = ["owner", "admin"].includes(profile.role);

    if (!isOwnerOrAdmin) {
      return NextResponse.json(
        { error: "Apenas owners e admins podem gerar cupons" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { code, percentage, validDays, maxUses, brand } = body;

    // Validate required fields
    if (!brand) {
      return NextResponse.json({ error: "Brand is required" }, { status: 400 });
    }

    if (percentage > 15) {
      return NextResponse.json(
        { error: "O desconto máximo permitido é de 15%" },
        { status: 400 }
      );
    }

    // Generate unique coupon code if not provided
    let couponCode = code?.trim();
    if (!couponCode) {
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

      couponCode = generatedCode;
    }

    // Calculate valid until date
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + (validDays || 30));

    // Create coupon in our database first
    const { data: newCoupon, error: createError } = await supabase
      .from("generated_coupons")
      .insert({
        code: couponCode,
        percentage: percentage,
        brand: brand,
        valid_until: validUntil.toISOString(),
        max_uses: maxUses || 100,
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

    // Prepare coupon payload for Nuvemshop API (without product restrictions for now)
    const couponPayload = {
      code: couponCode,
      type: "percentage",
      value: percentage.toString(),
      valid: true,
      max_uses: maxUses || 100,
      start_date: new Date().toISOString().split("T")[0],
      end_date: validUntil.toISOString().split("T")[0],
      min_price: 0,
      first_consumer_purchase: false,
      combines_with_other_discounts: false,
      includes_shipping: false,
      // Note: Not including products array to avoid potential issues
    };

    try {
      console.log(
        "Creating coupon in Nuvemshop with payload:",
        JSON.stringify(couponPayload, null, 2)
      );

      // Create coupon in Nuvemshop
      const nuvemshopCoupon = await fetchNuvemshopAPI("/coupons", {
        method: "POST",
        body: JSON.stringify(couponPayload),
      });

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
            maxUses: maxUses || 100,
            brand: brand,
            nuvemshopId: nuvemshopCoupon.id,
          },
          message:
            "Cupom criado com sucesso! (Versão sem restrições de produto)",
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
          suggestion: "Check if your API token has 'write_coupons' scope",
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
