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

// Helper function to extract brand from product IDs
async function getBrandFromProducts(
  productIds: number[],
  supabase: any
): Promise<string | null> {
  if (!productIds || productIds.length === 0) return null;

  const { data: products, error } = await supabase
    .from("nuvemshop_products")
    .select("brand")
    .in("product_id", productIds)
    .limit(1);

  if (error || !products || products.length === 0) return null;
  return products[0].brand;
}

// POST - Sync coupons from Nuvemshop to Supabase
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

    console.log("🔄 Starting coupon sync from Nuvemshop...");

    // Fetch all coupons from Nuvemshop
    let allCoupons: any[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      try {
        // Use the same pattern as working product sync
        const endpoint = `/coupons?limit=50&page=${page}`;
        console.log(`📄 Fetching page ${page}: ${endpoint}`);

        const couponsData = await fetchNuvemshopAPI(endpoint);

        const coupons = Array.isArray(couponsData)
          ? couponsData
          : couponsData.coupons || [];

        console.log(`📦 Found ${coupons.length} coupons on page ${page}`);

        if (coupons.length === 0) {
          console.log("📭 No more coupons found, ending pagination");
          hasMore = false;
        } else {
          allCoupons = allCoupons.concat(coupons);
          page++;

          // Safety limit to prevent infinite loops
          if (page > 10) {
            console.log("⚠️ Reached page limit (10), stopping for safety");
            hasMore = false;
          }
        }
      } catch (error) {
        // If it's a 404 error saying "Last page is X", that's normal - we've reached the end
        if (
          error instanceof Error &&
          error.message.includes("404") &&
          error.message.includes("Last page")
        ) {
          console.log(
            `✅ Pagination complete - reached last page (page ${page - 1})`
          );
          hasMore = false;
        }
        // If it's a 403 error, let's try without pagination
        else if (error instanceof Error && error.message.includes("403")) {
          console.log("⚠️ 403 error detected, trying simple /coupons endpoint");
          try {
            const simpleCouponsData = await fetchNuvemshopAPI("/coupons");
            console.log(
              "Simple coupons response:",
              JSON.stringify(simpleCouponsData, null, 2)
            );

            const simpleCoupons = Array.isArray(simpleCouponsData)
              ? simpleCouponsData
              : simpleCouponsData.coupons || [];
            allCoupons = allCoupons.concat(simpleCoupons);
          } catch (simpleError) {
            console.error("❌ Simple coupons call also failed:", simpleError);
          }
          hasMore = false;
        }
        // For other errors, log them and stop pagination
        else {
          console.error(`❌ Error fetching page ${page}:`, error);
          hasMore = false;
        }
      }
    }

    console.log(
      `✅ Successfully fetched ${allCoupons.length} coupons from Nuvemshop`
    );

    let syncedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // Process each coupon
    for (const nuvemshopCoupon of allCoupons) {
      try {
        // Extract brand from products if available
        let brand = null;
        if (nuvemshopCoupon.products && nuvemshopCoupon.products.length > 0) {
          const productIds = nuvemshopCoupon.products.map((p: any) => p.id);
          brand = await getBrandFromProducts(productIds, supabase);

          // If brand detection from products failed, try to infer from product names
          if (!brand && nuvemshopCoupon.products[0]?.name?.pt) {
            const productName =
              nuvemshopCoupon.products[0].name.pt.toLowerCase();
            if (productName.includes("desculpa")) {
              brand = "Desculpa qualquer coisa";
              console.log(`Inferred brand from product name: ${brand}`);
            }
          }
        }

        // For coupons without brand, try to infer from coupon code or use a default
        if (!brand) {
          // Check if coupon code contains brand information
          if (
            nuvemshopCoupon.code.includes("DESCULPA") ||
            nuvemshopCoupon.code.includes("TESTE")
          ) {
            brand = "Desculpa qualquer coisa";
            console.log(`Inferred brand from coupon code: ${brand}`);
          } else {
            // For now, let's sync all coupons and use "Unknown" as brand
            brand = "Unknown";
            console.log(
              `Coupon ${nuvemshopCoupon.code} - no brand found, using "Unknown"`
            );
          }
        }

        // Parse percentage value
        let percentage = 0;
        if (nuvemshopCoupon.type === "percentage") {
          percentage = parseFloat(nuvemshopCoupon.value) || 0;
        }

        // Check if coupon already exists in our database
        const { data: existingCoupon } = await supabase
          .from("generated_coupons")
          .select("id, nuvemshop_coupon_id")
          .eq("code", nuvemshopCoupon.code)
          .single();

        // Handle valid_until date - if no end_date, set to 1 year from now
        let validUntil;
        if (nuvemshopCoupon.end_date) {
          validUntil = new Date(nuvemshopCoupon.end_date).toISOString();
        } else {
          // If no end date, set to 1 year from now (unlimited coupons)
          const oneYearFromNow = new Date();
          oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
          validUntil = oneYearFromNow.toISOString();
          console.log(
            `Coupon ${nuvemshopCoupon.code} has no end_date, setting to 1 year from now: ${validUntil}`
          );
        }

        const couponData = {
          code: nuvemshopCoupon.code,
          percentage: Math.round(percentage),
          brand: brand,
          valid_until: validUntil,
          max_uses: nuvemshopCoupon.max_uses || 999999,
          current_uses: nuvemshopCoupon.used || 0,
          nuvemshop_coupon_id: nuvemshopCoupon.id.toString(),
          nuvemshop_status: "created",
          is_active: nuvemshopCoupon.valid || false,
          created_by: user.id, // Required for RLS policy
          created_by_brand: brand,
        };

        if (existingCoupon) {
          // Update existing coupon
          const { error: updateError } = await supabase
            .from("generated_coupons")
            .update(couponData)
            .eq("id", existingCoupon.id);

          if (updateError) {
            console.error(
              `Error updating coupon ${nuvemshopCoupon.code}:`,
              updateError
            );
            errors.push(
              `Update error for ${nuvemshopCoupon.code}: ${updateError.message}`
            );
            errorCount++;
          } else {
            console.log(`Updated coupon: ${nuvemshopCoupon.code}`);
            syncedCount++;
          }
        } else {
          // Insert new coupon
          const { error: insertError } = await supabase
            .from("generated_coupons")
            .insert(couponData);

          if (insertError) {
            console.error(
              `Error inserting coupon ${nuvemshopCoupon.code}:`,
              insertError
            );
            errors.push(
              `Insert error for ${nuvemshopCoupon.code}: ${insertError.message}`
            );
            errorCount++;
          } else {
            console.log(`Inserted new coupon: ${nuvemshopCoupon.code}`);
            syncedCount++;
          }
        }
      } catch (error) {
        console.error(
          `Error processing coupon ${nuvemshopCoupon.code}:`,
          error
        );
        errors.push(
          `Processing error for ${nuvemshopCoupon.code}: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
        errorCount++;
      }
    }

    console.log(
      `🎉 Coupon sync completed! ✅ Synced: ${syncedCount} | ❌ Errors: ${errorCount}`
    );

    return NextResponse.json({
      success: true,
      message: "Coupon sync completed",
      stats: {
        totalFetched: allCoupons.length,
        synced: syncedCount,
        errors: errorCount,
        errorDetails: errors.slice(0, 10), // Limit error details
      },
    });
  } catch (error) {
    console.error("Error in coupon sync:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to sync coupons",
      },
      { status: 500 }
    );
  }
}
