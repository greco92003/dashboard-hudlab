import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

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

// GET - Fetch products from Nuvemshop
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

    const { searchParams } = new URL(request.url);

    // Extract query parameters for filtering products
    const page = searchParams.get("page") || "1";
    const perPage = searchParams.get("per_page") || "50"; // Default 50, max 200
    const since = searchParams.get("since"); // ISO 8601 date
    const until = searchParams.get("until"); // ISO 8601 date
    const createdAtMin = searchParams.get("created_at_min"); // ISO 8601 date
    const createdAtMax = searchParams.get("created_at_max"); // ISO 8601 date
    const updatedAtMin = searchParams.get("updated_at_min"); // ISO 8601 date
    const updatedAtMax = searchParams.get("updated_at_max"); // ISO 8601 date
    const published = searchParams.get("published"); // true, false
    const freeShipping = searchParams.get("free_shipping"); // true, false
    const maxPrice = searchParams.get("max_price"); // decimal
    const minPrice = searchParams.get("min_price"); // decimal
    const categoryId = searchParams.get("category_id"); // integer
    const handle = searchParams.get("handle"); // string
    const fields = searchParams.get("fields"); // Specific fields to return
    const q = searchParams.get("q"); // Search query

    // Build query parameters for Nuvemshop API
    const queryParams = new URLSearchParams();
    queryParams.append("page", page);
    queryParams.append("per_page", perPage);

    if (since) queryParams.append("since", since);
    if (until) queryParams.append("until", until);
    if (createdAtMin) queryParams.append("created_at_min", createdAtMin);
    if (createdAtMax) queryParams.append("created_at_max", createdAtMax);
    if (updatedAtMin) queryParams.append("updated_at_min", updatedAtMin);
    if (updatedAtMax) queryParams.append("updated_at_max", updatedAtMax);
    if (published) queryParams.append("published", published);
    if (freeShipping) queryParams.append("free_shipping", freeShipping);
    if (maxPrice) queryParams.append("max_price", maxPrice);
    if (minPrice) queryParams.append("min_price", minPrice);
    if (categoryId) queryParams.append("category_id", categoryId);
    if (handle) queryParams.append("handle", handle);
    if (fields) queryParams.append("fields", fields);
    if (q) queryParams.append("q", q);

    // Fetch products from Nuvemshop
    const products = await fetchNuvemshopAPI(
      `/products?${queryParams.toString()}`
    );

    return NextResponse.json({
      success: true,
      data: products,
      pagination: {
        page: parseInt(page),
        per_page: parseInt(perPage),
        total: products.length,
      },
    });
  } catch (error) {
    console.error("Error fetching Nuvemshop products:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch products",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// POST - Create a new product in Nuvemshop
export async function POST(request: NextRequest) {
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

    const body = await request.json();

    // Create product in Nuvemshop
    const newProduct = await fetchNuvemshopAPI("/products", {
      method: "POST",
      body: JSON.stringify(body),
    });

    return NextResponse.json({
      success: true,
      data: newProduct,
      message: "Product created successfully",
    });
  } catch (error) {
    console.error("Error creating Nuvemshop product:", error);
    return NextResponse.json(
      {
        error: "Failed to create product",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// POST - Sync products from Nuvemshop to local database
export async function PUT(request: NextRequest) {
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

    const body = await request.json();
    const {
      syncPeriodDays = 30, // Default to last 30 days
      batchSize = 50, // Process in batches
    } = body;

    // Calculate date range for sync
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - syncPeriodDays);

    const createdAtMin = startDate.toISOString();
    const createdAtMax = endDate.toISOString();

    const allProducts = [];
    let currentPage = 1;
    let hasMorePages = true;

    // Fetch all products in the date range
    while (hasMorePages) {
      const queryParams = new URLSearchParams({
        page: currentPage.toString(),
        per_page: batchSize.toString(),
        created_at_min: createdAtMin,
        created_at_max: createdAtMax,
      });

      const products = await fetchNuvemshopAPI(
        `/products?${queryParams.toString()}`
      );

      if (products && products.length > 0) {
        allProducts.push(...products);
        currentPage++;

        // If we got less than the batch size, we've reached the end
        if (products.length < batchSize) {
          hasMorePages = false;
        }
      } else {
        hasMorePages = false;
      }
    }

    // Store products in database (you can customize this based on your needs)
    if (allProducts.length > 0) {
      // Transform products to match your database schema
      const transformedProducts = allProducts.map((product: any) => ({
        nuvemshop_id: product.id,
        name: product.name?.pt || product.name?.en || product.name?.es || "",
        description:
          product.description?.pt ||
          product.description?.en ||
          product.description?.es ||
          "",
        handle:
          product.handle?.pt || product.handle?.en || product.handle?.es || "",
        attributes: product.attributes,
        published: product.published,
        free_shipping: product.free_shipping,
        requires_shipping: product.requires_shipping,
        canonical_url: product.canonical_url,
        video_url: product.video_url,
        seo_title:
          product.seo_title?.pt ||
          product.seo_title?.en ||
          product.seo_title?.es ||
          "",
        seo_description:
          product.seo_description?.pt ||
          product.seo_description?.en ||
          product.seo_description?.es ||
          "",
        brand: product.brand,
        created_at: product.created_at,
        updated_at: product.updated_at,
        variants_data: product.variants,
        images_data: product.images,
        categories_data: product.categories,
        tags: product.tags,
        synced_at: new Date().toISOString(),
      }));

      // Upsert products to database
      const { error: upsertError } = await supabase
        .from("nuvemshop_products")
        .upsert(transformedProducts, {
          onConflict: "nuvemshop_id",
        });

      if (upsertError) {
        console.error("Error upserting products:", upsertError);
        return NextResponse.json(
          { error: "Failed to save products to database" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: "Products synced successfully",
      data: {
        totalProducts: allProducts.length,
        syncPeriod: `${syncPeriodDays} days`,
        dateRange: {
          from: createdAtMin,
          to: createdAtMax,
        },
      },
    });
  } catch (error) {
    console.error("Error syncing Nuvemshop products:", error);
    return NextResponse.json(
      {
        error: "Failed to sync products",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
