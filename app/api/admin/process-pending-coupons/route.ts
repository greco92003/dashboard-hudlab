import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  createNuvemshopCoupon,
  NuvemshopCouponPayload,
} from "@/lib/nuvemshop/api";

// POST - Process pending auto-coupons and create them in Nuvemshop
export async function POST(request: NextRequest) {
  try {
    // Check for service role authentication (for webhook calls)
    const authHeader = request.headers.get("authorization");
    const isServiceRole =
      authHeader === `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`;

    let supabase;

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
    }

    console.log("🔄 Processing pending auto-coupons...");

    // Get all pending auto-coupons (those with nuvemshop_status = 'pending')
    const { data: pendingCoupons, error: fetchError } = await supabase
      .from("generated_coupons")
      .select("id, code, brand, percentage, valid_until, max_uses")
      .eq("nuvemshop_status", "pending")
      .like("code", "%15"); // Auto-coupons end with "15"

    if (fetchError) {
      console.error("Error fetching pending coupons:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch pending coupons" },
        { status: 500 }
      );
    }

    if (!pendingCoupons || pendingCoupons.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No pending auto-coupons to process",
        processed: 0,
        errors: 0,
      });
    }

    console.log(
      `📦 Found ${pendingCoupons.length} pending auto-coupons to process`
    );

    let processedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // Process each pending coupon
    for (const coupon of pendingCoupons) {
      try {
        console.log(
          `🎫 Processing coupon: ${coupon.code} for brand: ${coupon.brand}`
        );

        // Get products for this brand to apply coupon restrictions
        const { data: brandProducts, error: productsError } = await supabase
          .from("nuvemshop_products")
          .select("product_id")
          .eq("brand", coupon.brand)
          .eq("published", true)
          .eq("sync_status", "synced");

        if (productsError) {
          console.error(
            `Error fetching products for brand ${coupon.brand}:`,
            productsError
          );
        }

        // Convert product_id strings to integers and filter out invalid ones
        const productIds =
          brandProducts
            ?.map((p) => {
              const id = parseInt(p.product_id, 10);
              return isNaN(id) ? null : id;
            })
            .filter((id) => id !== null) || [];

        console.log(`📦 Product IDs for ${coupon.brand}:`, productIds);

        // Preparar dados do cupom conforme documentação NuvemShop
        const couponData: NuvemshopCouponPayload = {
          code: coupon.code,
          type: "percentage",
          value: coupon.percentage.toString(),
          valid: true,
          start_date: new Date().toISOString().split("T")[0],
          end_date: coupon.valid_until
            ? new Date(coupon.valid_until).toISOString().split("T")[0]
            : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split("T")[0],
          min_price: 0,
          max_uses: coupon.max_uses || null, // null = unlimited
          includes_shipping: false,
          first_consumer_purchase: false,
          combines_with_other_discounts: false,
        };

        // Adicionar restrições de produtos se existirem
        if (productIds.length > 0) {
          couponData.products = productIds;
          console.log(
            `📦 Adding product restrictions: ${productIds.length} products`
          );
        } else {
          console.log(`📦 Creating general coupon (no product restrictions)`);
        }

        // Criar cupom no NuvemShop usando a função melhorada
        const nuvemshopCoupon = await createNuvemshopCoupon(couponData);

        console.log(
          `✅ Nuvemshop coupon created: ${coupon.code} (ID: ${nuvemshopCoupon.id})`
        );

        // Update the coupon in Supabase with Nuvemshop ID
        const { error: updateError } = await supabase
          .from("generated_coupons")
          .update({
            nuvemshop_coupon_id: nuvemshopCoupon.id.toString(),
            nuvemshop_status: "created",
            nuvemshop_error: null, // Clear any previous errors
          })
          .eq("id", coupon.id);

        if (updateError) {
          console.error(`Error updating coupon ${coupon.code}:`, updateError);
          errors.push(
            `Update error for ${coupon.code}: ${updateError.message}`
          );
          errorCount++;
        } else {
          processedCount++;
        }
      } catch (error) {
        console.error(`Error processing coupon ${coupon.code}:`, error);

        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        errors.push(`${coupon.code}: ${errorMessage}`);
        errorCount++;

        // Update coupon status to error
        await supabase
          .from("generated_coupons")
          .update({
            nuvemshop_status: "error",
            nuvemshop_error: errorMessage,
          })
          .eq("id", coupon.id);
      }
    }

    console.log(
      `🎉 Processing completed. Processed: ${processedCount}, Errors: ${errorCount}`
    );

    return NextResponse.json({
      success: true,
      message: "Pending auto-coupons processing completed",
      stats: {
        total: pendingCoupons.length,
        processed: processedCount,
        errors: errorCount,
        errorDetails: errors.slice(0, 10), // Limit error details
      },
    });
  } catch (error) {
    console.error("Error in process pending coupons:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

// GET - Check status of pending auto-coupons
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

    // Get statistics about auto-coupons
    const { data: stats, error: statsError } = await supabase
      .from("generated_coupons")
      .select("nuvemshop_status, brand")
      .like("code", "%15"); // Auto-coupons end with "15"

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
