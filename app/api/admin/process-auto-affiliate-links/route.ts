import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

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

    console.log("🔗 Processing auto-affiliate-links for all brands...");

    // Get all unique brands that have published products but no affiliate link
    const { data: brandsWithoutLinks, error: brandsError } = await supabase
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
      ...new Set(brandsWithoutLinks?.map((p) => p.brand) || []),
    ];

    // Filter out brands that already have affiliate links
    const { data: existingLinks, error: linksError } = await supabase
      .from("affiliate_links")
      .select("brand")
      .eq("is_active", true);

    if (linksError) {
      console.error("Error fetching existing affiliate links:", linksError);
      return NextResponse.json(
        { error: "Failed to fetch existing affiliate links" },
        { status: 500 }
      );
    }

    const brandsWithLinks = new Set(
      existingLinks?.map((l) => l.brand) || []
    );
    const brandsNeedingLinks = uniqueBrands.filter(
      (brand) => !brandsWithLinks.has(brand)
    );

    console.log(
      `🏷️ Found ${brandsNeedingLinks.length} brands needing auto-affiliate-links:`,
      brandsNeedingLinks
    );

    if (brandsNeedingLinks.length === 0) {
      return NextResponse.json({
        success: true,
        message: "All brands already have affiliate links",
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

    // Process each brand that needs an affiliate link
    for (const brand of brandsNeedingLinks) {
      try {
        console.log(`🔗 Creating auto-affiliate-link for brand: ${brand}`);

        // Generate affiliate URL
        const affiliateUrl = `https://hudlab.com.br/?utm_source=LandingPage&utm_medium=${brand.replace(/\s+/g, '-')}`;

        // Create affiliate link in Supabase
        const { data: newLink, error: createError } = await supabase
          .from("affiliate_links")
          .insert({
            url: affiliateUrl,
            brand: brand,
            created_by: user.id,
            is_active: true,
          })
          .select()
          .single();

        if (createError) {
          console.error(
            `Error creating auto-affiliate-link for ${brand}:`,
            createError
          );
          errors.push(`${brand}: Database error - ${createError.message}`);
          errorCount++;
          continue;
        }

        console.log(
          `✅ Auto-affiliate-link created for ${brand}: ${affiliateUrl}`
        );

        processedCount++;
      } catch (error) {
        console.error(`Unexpected error processing brand ${brand}:`, error);
        errors.push(
          `${brand}: Unexpected error - ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
        errorCount++;
      }
    }

    console.log(
      `🎯 Auto-affiliate-links processing completed: ${processedCount} created, ${errorCount} errors`
    );

    if (errors.length > 0) {
      console.error("Errors during auto-affiliate-links processing:", errors);
    }

    return NextResponse.json({
      success: true,
      message: `Auto-affiliate-links processing completed`,
      stats: {
        total: uniqueBrands.length,
        processed: processedCount,
        errors: errorCount,
      },
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Error in process-auto-affiliate-links:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
