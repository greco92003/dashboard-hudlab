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

    // Check if force parameter is provided
    const body = await request.json().catch(() => ({}));
    const forceRecreate = body.force === true;

    console.log("🔗 Processing auto-affiliate-links for all brands...");
    if (forceRecreate) {
      console.log("⚠️ FORCE MODE: Will recreate links for Zenith brand");
    }

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
      .select("brand, url")
      .eq("is_active", true);

    if (linksError) {
      console.error("Error fetching existing affiliate links:", linksError);
      return NextResponse.json(
        { error: "Failed to fetch existing affiliate links" },
        { status: 500 }
      );
    }

    // Special handling for Zenith: check if it has franchise-specific links
    const zenithBrand = uniqueBrands.find(
      (b) => b.toLowerCase().trim() === "zenith"
    );

    let zenithNeedsProcessing = false;

    if (zenithBrand) {
      const zenithLinks =
        existingLinks?.filter(
          (l) => l.brand.toLowerCase().trim() === "zenith"
        ) || [];

      // Check if Zenith has all 3 franchise-specific links
      const hasSantos = zenithLinks.some((l) => l.url.includes("Santos-SP"));
      const hasGaropaba = zenithLinks.some((l) =>
        l.url.includes("Garopaba-SC")
      );
      const hasTaquara = zenithLinks.some((l) => l.url.includes("Taquara-RS"));

      const hasAllFranchiseLinks = hasSantos && hasGaropaba && hasTaquara;

      if (!hasAllFranchiseLinks) {
        console.log(
          `⚠️ Zenith brand needs franchise-specific links. Current: Santos=${hasSantos}, Garopaba=${hasGaropaba}, Taquara=${hasTaquara}`
        );
        zenithNeedsProcessing = true;

        // Deactivate old Zenith links that don't have franchise info
        const oldZenithLinks = zenithLinks.filter(
          (l) =>
            !l.url.includes("Santos-SP") &&
            !l.url.includes("Garopaba-SC") &&
            !l.url.includes("Taquara-RS")
        );

        if (oldZenithLinks.length > 0) {
          console.log(
            `🗑️ Deactivating ${oldZenithLinks.length} old Zenith links without franchise info...`
          );
          const { error: deactivateError } = await supabase
            .from("affiliate_links")
            .update({ is_active: false })
            .eq("brand", zenithBrand)
            .eq("is_active", true)
            .not("url", "like", "%Santos-SP%")
            .not("url", "like", "%Garopaba-SC%")
            .not("url", "like", "%Taquara-RS%");

          if (deactivateError) {
            console.error(
              "Error deactivating old Zenith links:",
              deactivateError
            );
          } else {
            console.log("✅ Old Zenith links deactivated");
          }
        }
      }
    }

    // Build set of brands that have proper links
    const brandsWithLinks = new Set<string>();
    existingLinks?.forEach((link) => {
      const brand = link.brand;
      const isZenith = brand.toLowerCase().trim() === "zenith";

      // For Zenith, don't add to the set if it needs processing
      if (isZenith && zenithNeedsProcessing) {
        return;
      }

      brandsWithLinks.add(brand);
    });

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

        // Check if it's Zenith brand - if so, create links for each franchise
        const isZenith = brand.toLowerCase().trim() === "zenith";

        if (isZenith) {
          // Create affiliate links for each Zenith franchise
          const franchises = [
            { name: "Santos-SP", displayName: "Santos - SP" },
            { name: "Garopaba-SC", displayName: "Garopaba - SC" },
            { name: "Taquara-RS", displayName: "Taquara - RS" },
          ];

          // Get existing Zenith links to avoid duplicates
          const { data: existingZenithLinks } = await supabase
            .from("affiliate_links")
            .select("url")
            .eq("brand", brand)
            .eq("is_active", true);

          const existingUrls = new Set(
            existingZenithLinks?.map((l) => l.url) || []
          );

          for (const franchise of franchises) {
            // Generate affiliate URL with franchise name
            const affiliateUrl = `https://hudlab.com.br/?utm_source=LandingPage&utm_medium=${brand.replace(
              /\s+/g,
              "-"
            )}-${franchise.name}`;

            // Skip if this franchise link already exists
            if (existingUrls.has(affiliateUrl)) {
              console.log(
                `⏭️ Link for ${brand} - ${franchise.displayName} already exists, skipping...`
              );
              continue;
            }

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
                `Error creating auto-affiliate-link for ${brand} - ${franchise.displayName}:`,
                createError
              );
              errors.push(
                `${brand} - ${franchise.displayName}: Database error - ${createError.message}`
              );
              errorCount++;
              continue;
            }

            console.log(
              `✅ Auto-affiliate-link created for ${brand} - ${franchise.displayName}: ${affiliateUrl}`
            );

            processedCount++;
          }
        } else {
          // For non-Zenith brands, create a single affiliate link
          const affiliateUrl = `https://hudlab.com.br/?utm_source=LandingPage&utm_medium=${brand.replace(
            /\s+/g,
            "-"
          )}`;

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
        }
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
