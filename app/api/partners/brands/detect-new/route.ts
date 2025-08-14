import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// POST - Detect new brands and generate auto-coupons
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

    // Get all brands from published products
    const { data: allBrands, error: brandsError } = await supabase
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

    // Get unique brands
    const uniqueBrands = [...new Set(allBrands?.map((p) => p.brand) || [])];

    // Get existing auto-generated coupons (those ending with -15)
    const { data: existingCoupons, error: couponsError } = await supabase
      .from("generated_coupons")
      .select("brand, code")
      .eq("is_active", true)
      .like("code", "%-15");

    if (couponsError) {
      console.error("Error fetching existing coupons:", couponsError);
      return NextResponse.json(
        { error: "Failed to fetch existing coupons" },
        { status: 500 }
      );
    }

    // Find brands without auto-coupons
    const existingCouponBrands = new Set(
      existingCoupons?.map((c) => c.brand) || []
    );
    const newBrands = uniqueBrands.filter(
      (brand) => !existingCouponBrands.has(brand)
    );

    const results = {
      totalBrands: uniqueBrands.length,
      existingCoupons: existingCouponBrands.size,
      newBrandsFound: newBrands.length,
      newBrands: newBrands,
      generatedCoupons: [] as Array<{
        brand: string;
        code: string;
        id: string;
        percentage: number;
        validUntil: string;
      }>,
      errors: [] as Array<{ brand: string; error: string }>,
    };

    // Generate auto-coupons for new brands
    for (const brand of newBrands) {
      try {
        const { data: result, error: generateError } = await supabase.rpc(
          "generate_auto_coupon_for_brand",
          {
            brand_name: brand,
          }
        );

        if (generateError) {
          console.error(
            `Error generating coupon for brand ${brand}:`,
            generateError
          );
          results.errors.push({
            brand,
            error: generateError.message,
          });
          continue;
        }

        const couponResult = result?.[0];

        if (couponResult?.success) {
          results.generatedCoupons.push({
            brand,
            code: couponResult.coupon_code,
            id: couponResult.coupon_id,
            percentage: couponResult.percentage || 0,
            validUntil: couponResult.valid_until || "",
          });
        } else {
          results.errors.push({
            brand,
            error: couponResult?.error_message || "Unknown error",
          });
        }
      } catch (error) {
        console.error(`Error processing brand ${brand}:`, error);
        results.errors.push({
          brand,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: `Processamento concluído. ${results.generatedCoupons.length} cupons gerados para ${results.newBrandsFound} marcas novas.`,
        results,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in detect new brands:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET - Get summary of brands and auto-coupon status
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

    // Check if user has permission
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("role, approved")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.approved) {
      return NextResponse.json({ error: "User not approved" }, { status: 403 });
    }

    const allowedRoles = ["owner", "admin", "manager", "partners-media"];
    if (!allowedRoles.includes(profile.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    // Get all brands from published products
    const { data: allBrands, error: brandsError } = await supabase
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

    // Get unique brands
    const uniqueBrands = [...new Set(allBrands?.map((p) => p.brand) || [])];

    // Get existing auto-generated coupons
    const { data: existingCoupons, error: couponsError } = await supabase
      .from("generated_coupons")
      .select("brand, code, created_at")
      .eq("is_active", true)
      .like("code", "%-15")
      .order("created_at", { ascending: false });

    if (couponsError) {
      console.error("Error fetching existing coupons:", couponsError);
      return NextResponse.json(
        { error: "Failed to fetch existing coupons" },
        { status: 500 }
      );
    }

    const existingCouponBrands = new Set(
      existingCoupons?.map((c) => c.brand) || []
    );
    const brandsWithoutCoupons = uniqueBrands.filter(
      (brand) => !existingCouponBrands.has(brand)
    );

    return NextResponse.json({
      success: true,
      summary: {
        totalBrands: uniqueBrands.length,
        brandsWithAutoCoupons: existingCouponBrands.size,
        brandsWithoutAutoCoupons: brandsWithoutCoupons.length,
        lastCouponGenerated: existingCoupons?.[0]?.created_at || null,
      },
      brandsWithoutCoupons,
      existingAutoCoupons:
        existingCoupons?.map((c) => ({
          brand: c.brand,
          code: c.code,
          createdAt: c.created_at,
        })) || [],
    });
  } catch (error) {
    console.error("Error in brands summary GET:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
