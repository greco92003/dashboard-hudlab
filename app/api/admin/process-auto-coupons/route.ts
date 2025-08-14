import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  createNuvemshopCoupon,
  NuvemshopCouponPayload,
} from "@/lib/nuvemshop/api";

// POST - Process all brands that need auto-coupons
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

    console.log("🔄 Processing auto-coupons for all brands...");

    // Get all unique brands that have published products but no auto-coupon
    const { data: brandsWithoutCoupons, error: brandsError } = await supabase
      .from("nuvemshop_products")
      .select("brand")
      .eq("published", true)
      .eq("sync_status", "synced")
      .not("brand", "is", null)
      .not("brand", "eq", "");

    if (brandsError) {
      console.error("Error fetching brands:", brandsError);
      return NextResponse.json(
        { error: "Failed to fetch brands" },
        { status: 500 }
      );
    }

    // Get unique brands
    const uniqueBrands = [
      ...new Set(brandsWithoutCoupons?.map((p) => p.brand) || []),
    ];

    // Filter out brands that already have auto-coupons
    const { data: existingCoupons, error: couponsError } = await supabase
      .from("generated_coupons")
      .select("brand")
      .like("code", "%15")
      .eq("is_active", true);

    if (couponsError) {
      console.error("Error fetching existing coupons:", couponsError);
      return NextResponse.json(
        { error: "Failed to fetch existing coupons" },
        { status: 500 }
      );
    }

    const brandsWithCoupons = new Set(
      existingCoupons?.map((c) => c.brand) || []
    );
    const brandsNeedingCoupons = uniqueBrands.filter(
      (brand) => !brandsWithCoupons.has(brand)
    );

    console.log(
      `📦 Found ${brandsNeedingCoupons.length} brands needing auto-coupons:`,
      brandsNeedingCoupons
    );

    if (brandsNeedingCoupons.length === 0) {
      return NextResponse.json({
        success: true,
        message: "All brands already have auto-coupons",
        stats: {
          total: uniqueBrands.length,
          processed: 0,
          errors: 0,
        },
      });
    }

    let processedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // Process each brand that needs an auto-coupon
    for (const brand of brandsNeedingCoupons) {
      try {
        console.log(`🎫 Creating auto-coupon for brand: ${brand}`);

        // Generate coupon code (first word of brand + "15", all uppercase)
        const firstWord = brand.trim().split(/\s+/)[0];
        const couponCode = `${firstWord.toUpperCase()}15`;

        // Get products for this brand
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

        console.log(
          `📦 Found ${productIds.length} products for brand ${brand}`
        );

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
            created_by: user.id,
            created_by_brand: brand,
            nuvemshop_status: "pending",
            is_auto_generated: true, // Mark as auto-generated
          })
          .select()
          .single();

        if (createError) {
          console.error(
            `Error creating auto-coupon for ${brand}:`,
            createError
          );
          errors.push(`${brand}: Database error - ${createError.message}`);
          errorCount++;
          continue;
        }

        // Preparar dados do cupom conforme documentação NuvemShop
        const couponData: NuvemshopCouponPayload = {
          code: couponCode,
          type: "percentage",
          value: "15",
          valid: true,
          start_date: startDate,
          end_date: endDate,
          min_price: 0,
          max_uses: null, // null = unlimited
          includes_shipping: false,
          first_consumer_purchase: false,
          combines_with_other_discounts: false,
        };

        // Adicionar restrições de produtos se existirem
        if (productIds.length > 0) {
          couponData.products = productIds;
          console.log(
            `📦 Adding product restrictions for ${brand}: ${productIds.length} products`
          );
        } else {
          console.log(
            `📦 Creating general coupon for ${brand} (no product restrictions)`
          );
        }

        console.log(`📋 Creating auto-coupon in Nuvemshop for ${brand}`);

        // Criar cupom no NuvemShop usando a função melhorada
        const nuvemshopCoupon = await createNuvemshopCoupon(couponData);

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
          console.error(
            `Error updating auto-coupon ${couponCode}:`,
            updateError
          );
          errors.push(`${brand}: Update error - ${updateError.message}`);
          errorCount++;
        } else {
          processedCount++;
        }
      } catch (error) {
        console.error(`Error processing auto-coupon for ${brand}:`, error);

        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        errors.push(`${brand}: ${errorMessage}`);
        errorCount++;

        // Try to update coupon status to error if it was created
        try {
          await supabase
            .from("generated_coupons")
            .update({
              nuvemshop_status: "error",
              nuvemshop_error: errorMessage,
            })
            .eq("brand", brand)
            .like("code", "%15");
        } catch (updateError) {
          console.error(
            `Error updating error status for ${brand}:`,
            updateError
          );
        }
      }
    }

    console.log(
      `🎉 Auto-coupon processing completed. Processed: ${processedCount}, Errors: ${errorCount}`
    );

    return NextResponse.json({
      success: true,
      message: "Auto-coupon processing completed",
      stats: {
        total: brandsNeedingCoupons.length,
        processed: processedCount,
        errors: errorCount,
        errorDetails: errors.slice(0, 10), // Limit error details
      },
    });
  } catch (error) {
    console.error("Error in process auto-coupons:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

// GET - Check status of auto-coupons for all brands
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

    // Get all unique brands
    const { data: allBrands, error: brandsError } = await supabase
      .from("nuvemshop_products")
      .select("brand")
      .eq("published", true)
      .eq("sync_status", "synced")
      .not("brand", "is", null)
      .not("brand", "eq", "");

    if (brandsError) {
      console.error("Error fetching brands:", brandsError);
      return NextResponse.json(
        { error: "Failed to fetch brands" },
        { status: 500 }
      );
    }

    const uniqueBrands = [...new Set(allBrands?.map((p) => p.brand) || [])];

    // Get auto-coupons statistics
    const { data: autoCoupons, error: couponsError } = await supabase
      .from("generated_coupons")
      .select("brand, nuvemshop_status")
      .like("code", "%15")
      .eq("is_active", true);

    if (couponsError) {
      console.error("Error fetching auto-coupons:", couponsError);
      return NextResponse.json(
        { error: "Failed to fetch auto-coupons" },
        { status: 500 }
      );
    }

    const statusCounts =
      autoCoupons?.reduce((acc, coupon) => {
        acc[coupon.nuvemshop_status] = (acc[coupon.nuvemshop_status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};

    const brandsWithCoupons = new Set(autoCoupons?.map((c) => c.brand) || []);
    const brandsWithoutCoupons = uniqueBrands.filter(
      (brand) => !brandsWithCoupons.has(brand)
    );

    return NextResponse.json({
      success: true,
      stats: {
        totalBrands: uniqueBrands.length,
        brandsWithAutoCoupons: brandsWithCoupons.size,
        brandsWithoutAutoCoupons: brandsWithoutCoupons.length,
        autoCouponsByStatus: statusCounts,
        brandsNeedingCoupons: brandsWithoutCoupons,
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
