import { NextRequest, NextResponse } from "next/server";

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

// GET - Check Ralph Lauren product status directly from NuvemShop API
export async function GET(request: NextRequest) {
  try {
    const productId = "282707953"; // Ralph Lauren product ID from database

    console.log(`🔍 Checking Ralph Lauren product ${productId} directly from NuvemShop API...`);

    // Fetch product directly from NuvemShop API
    const product = await fetchNuvemshopAPI(`/products/${productId}`);

    console.log(`📋 Product data from NuvemShop API:`, {
      id: product.id,
      name: product.name,
      brand: product.brand,
      published: product.published,
      created_at: product.created_at,
      updated_at: product.updated_at,
    });

    return NextResponse.json({
      success: true,
      data: {
        product_id: product.id,
        name: product.name,
        brand: product.brand,
        published: product.published,
        created_at: product.created_at,
        updated_at: product.updated_at,
        full_product: product,
      },
      message: `Product ${productId} fetched directly from NuvemShop API`,
    });
  } catch (error) {
    console.error("Error checking Ralph Lauren product:", error);
    return NextResponse.json(
      {
        error: "Failed to check Ralph Lauren product",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
