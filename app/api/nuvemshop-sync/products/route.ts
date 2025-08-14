import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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

// Create Supabase client for sync operations (uses service key)
async function createSupabaseServerForSync() {
  const { createClient } = await import("@supabase/supabase-js");

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      db: {
        schema: "public",
      },
      global: {
        headers: {
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    }
  );
}

// Create Supabase client for regular operations
async function createSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
}

// Function to extract Portuguese name from multilingual name object
function extractPortugueseName(nameObj: any): string | null {
  if (!nameObj) return null;

  // Try different possible fields for Portuguese name
  return (
    nameObj.pt ||
    nameObj.por ||
    nameObj.portuguese ||
    nameObj.default ||
    (typeof nameObj === "string" ? nameObj : null)
  );
}

// Function to get featured image info
function getFeaturedImageInfo(images: any[]) {
  if (!images || !Array.isArray(images) || images.length === 0) {
    return { featuredImageId: null, featuredImageSrc: null };
  }

  // Find the first image or the one marked as featured
  const featuredImage = images.find((img) => img.featured) || images[0];

  return {
    featuredImageId: featuredImage?.id?.toString() || null,
    featuredImageSrc: featuredImage?.src || null,
  };
}

// Function to process and save products to Supabase
async function processProducts(products: any[], supabase: any) {
  const processedProducts = [];
  let newRecords = 0;
  const updatedRecords = 0;
  let errorRecords = 0;

  for (const product of products) {
    try {
      // Get featured image info
      const { featuredImageId, featuredImageSrc } = getFeaturedImageInfo(
        product.images
      );

      // Extract and process product data according to the structure you specified
      const processedProduct = {
        product_id: product.id.toString(), // Hidden field in API

        // Product basic info
        name: product.name || null, // Multilingual object
        name_pt: extractPortugueseName(product.name),

        // Product details
        brand: product.brand || null,
        description: product.description?.pt || product.description || null,
        handle: product.handle || null,
        canonical_url: product.canonical_url || null,

        // Product variants (any id with price)
        variants: product.variants || [],

        // Product images
        images: product.images || [],
        featured_image_id: featuredImageId,
        featured_image_src: featuredImageSrc,

        // Product status and visibility
        published: product.published || false,
        free_shipping: product.free_shipping || false,

        // SEO and metadata
        seo_title: product.seo_title || null,
        seo_description: product.seo_description || null,
        tags: product.tags || [],

        // Sync metadata
        last_synced_at: new Date().toISOString(),
        api_updated_at: product.updated_at
          ? new Date(product.updated_at).toISOString()
          : null,
        sync_status: "synced" as const,
      };

      // Upsert product to Supabase
      const { data, error } = await supabase
        .from("nuvemshop_products")
        .upsert(processedProduct, {
          onConflict: "product_id",
          ignoreDuplicates: false,
        })
        .select("*");

      if (error) {
        console.error(`Error upserting product ${product.id}:`, error);
        errorRecords++;
      } else {
        // Check if it was an insert or update
        if (data && data.length > 0) {
          // For simplicity, we'll count all as new records
          // In a real implementation, you'd check if the record existed before
          newRecords++;
        }
        processedProducts.push(processedProduct);
      }
    } catch (error) {
      console.error(`Error processing product ${product.id}:`, error);
      errorRecords++;
    }
  }

  return {
    processedProducts,
    stats: {
      newRecords,
      updatedRecords,
      errorRecords,
    },
  };
}

// Main sync function
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerForSync();

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "100");
    const page = parseInt(searchParams.get("page") || "1");
    const published = searchParams.get("published"); // true, false, or null for all

    // Start sync log
    const syncStartTime = new Date();
    const { data: syncLog, error: syncLogError } = await supabase
      .from("nuvemshop_sync_log")
      .insert({
        sync_type: "products",
        status: "running",
        started_at: syncStartTime.toISOString(),
        triggered_by: "manual",
      })
      .select("id")
      .single();

    if (syncLogError) {
      throw new Error(`Failed to create sync log: ${syncLogError.message}`);
    }

    // Fetch products from Nuvemshop API
    let endpoint = `/products?limit=${limit}&page=${page}`;
    if (published !== null) {
      endpoint += `&published=${published}`;
    }

    const productsResponse = await fetchNuvemshopAPI(endpoint);
    const products = productsResponse.products || productsResponse;

    // Process and save products
    const { processedProducts, stats } = await processProducts(
      products,
      supabase
    );

    // Update sync log with completion
    const syncEndTime = new Date();
    const durationSeconds = Math.floor(
      (syncEndTime.getTime() - syncStartTime.getTime()) / 1000
    );

    await supabase
      .from("nuvemshop_sync_log")
      .update({
        status: "completed",
        completed_at: syncEndTime.toISOString(),
        duration_seconds: durationSeconds,
        total_records: products.length,
        processed_records: processedProducts.length,
        new_records: stats.newRecords,
        updated_records: stats.updatedRecords,
        error_records: stats.errorRecords,
      })
      .eq("id", syncLog.id);

    return NextResponse.json({
      success: true,
      message: `Successfully synced ${processedProducts.length} products`,
      stats: {
        total_fetched: products.length,
        processed: processedProducts.length,
        new_records: stats.newRecords,
        updated_records: stats.updatedRecords,
        error_records: stats.errorRecords,
        duration_seconds: durationSeconds,
      },
      sync_log_id: syncLog.id,
    });
  } catch (error) {
    console.error("Nuvemshop products sync error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 }
    );
  }
}

// GET method to fetch products from database
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user profile to check role and assigned brand
    const { data: userProfile, error: profileError } = await supabase
      .from("user_profiles")
      .select("role, assigned_brand")
      .eq("id", user.id)
      .single();

    if (profileError || !userProfile) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);

    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");
    const published = searchParams.get("published");
    const brand = searchParams.get("brand");
    const search = searchParams.get("search");

    let query = supabase
      .from("nuvemshop_products")
      .select("*")
      .eq("sync_status", "synced")
      .order("last_synced_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply brand filter for partners-media users
    if (userProfile.role === "partners-media" && userProfile.assigned_brand) {
      query = query.eq("brand", userProfile.assigned_brand);
    }

    // For owners/admins, apply brand filter only if a specific brand is selected
    else if (["owner", "admin"].includes(userProfile.role)) {
      if (brand && brand !== "all") {
        query = query.eq("brand", brand);
      }
      // If brand is null or "all", show all products (no brand filter)
    }

    // Add additional filters if provided (and user has permission)
    if (published !== null) {
      query = query.eq("published", published === "true");
    }

    if (search) {
      query = query.ilike("name_pt", `%${search}%`);
    }

    const { data: products, error } = await query;

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    // Get total count for pagination
    let countQuery = supabase
      .from("nuvemshop_products")
      .select("*", { count: "exact", head: true })
      .eq("sync_status", "synced");

    // Apply same filters for count
    if (userProfile.role === "partners-media" && userProfile.assigned_brand) {
      countQuery = countQuery.eq("brand", userProfile.assigned_brand);
    }
    // For owners/admins, apply brand filter only if a specific brand is selected
    else if (
      ["owner", "admin"].includes(userProfile.role) &&
      brand &&
      brand !== "all"
    ) {
      countQuery = countQuery.eq("brand", brand);
    }

    if (published !== null) {
      countQuery = countQuery.eq("published", published === "true");
    }

    if (search) {
      countQuery = countQuery.ilike("name_pt", `%${search}%`);
    }

    const { count: totalCount, error: countError } = await countQuery;

    if (countError) {
      console.error("Error getting count:", countError);
    }

    return NextResponse.json({
      success: true,
      products: products || [],
      total: totalCount || 0,
    });
  } catch (error) {
    console.error("Error fetching products:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 }
    );
  }
}
