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

// Function to extract Portuguese name from multilingual object
function extractPortugueseName(nameObj: any): string | null {
  if (!nameObj) return null;
  if (typeof nameObj === "string") return nameObj;
  if (typeof nameObj === "object") {
    return nameObj.pt || nameObj.en || nameObj.es || Object.values(nameObj)[0] || null;
  }
  return null;
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

// POST - Force sync Ralph Lauren product
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const productId = "282707953"; // Ralph Lauren product ID

    console.log(`🔄 Force syncing Ralph Lauren product ${productId}...`);

    // Fetch product directly from NuvemShop API
    const product = await fetchNuvemshopAPI(`/products/${productId}`);

    console.log(`📋 Product data from NuvemShop API:`, {
      id: product.id,
      name: product.name,
      brand: product.brand,
      published: product.published,
    });

    // Get featured image info
    const { featuredImageId, featuredImageSrc } = getFeaturedImageInfo(product.images);

    // Process product data according to the existing structure
    const processedProduct = {
      product_id: product.id.toString(),
      name: product.name || null,
      name_pt: extractPortugueseName(product.name),
      brand: product.brand || null,
      description: product.description?.pt || product.description || null,
      handle: product.handle || null,
      canonical_url: product.canonical_url || null,
      variants: product.variants || [],
      images: product.images || [],
      featured_image_id: featuredImageId,
      featured_image_src: featuredImageSrc,
      published: product.published || false,
      free_shipping: product.free_shipping || false,
      seo_title: product.seo_title || null,
      seo_description: product.seo_description || null,
      tags: product.tags || [],
      last_synced_at: new Date().toISOString(),
      api_updated_at: product.updated_at ? new Date(product.updated_at).toISOString() : null,
      sync_status: "synced" as const,
    };

    console.log(`💾 Updating product in database with published: ${processedProduct.published}`);

    // Update product in Supabase
    const { data, error } = await supabase
      .from("nuvemshop_products")
      .upsert(processedProduct, {
        onConflict: "product_id",
        ignoreDuplicates: false,
      })
      .select("id, product_id, name_pt, brand, published, sync_status");

    if (error) {
      console.error("Error updating product:", error);
      throw new Error(`Failed to update product: ${error.message}`);
    }

    console.log(`✅ Product updated successfully:`, data);

    return NextResponse.json({
      success: true,
      data: {
        updated_product: data,
        nuvemshop_data: {
          id: product.id,
          name: product.name,
          brand: product.brand,
          published: product.published,
        },
        processed_data: {
          product_id: processedProduct.product_id,
          name_pt: processedProduct.name_pt,
          brand: processedProduct.brand,
          published: processedProduct.published,
          sync_status: processedProduct.sync_status,
        },
      },
      message: `Ralph Lauren product ${productId} synced successfully`,
    });
  } catch (error) {
    console.error("Error syncing Ralph Lauren product:", error);
    return NextResponse.json(
      {
        error: "Failed to sync Ralph Lauren product",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
