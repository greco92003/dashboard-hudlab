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

// GET - Fetch all images for a specific product from Nuvemshop
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const resolvedParams = await params;
    const productId = resolvedParams.id;
    const { searchParams } = new URL(request.url);

    // Extract query parameters for filtering images
    const page = searchParams.get("page") || "1";
    const perPage = searchParams.get("per_page") || "50";
    const since = searchParams.get("since"); // ISO 8601 date
    const until = searchParams.get("until"); // ISO 8601 date
    const fields = searchParams.get("fields"); // Specific fields to return

    // Build query parameters for Nuvemshop API
    const queryParams = new URLSearchParams();
    queryParams.append("page", page);
    queryParams.append("per_page", perPage);

    if (since) queryParams.append("since", since);
    if (until) queryParams.append("until", until);
    if (fields) queryParams.append("fields", fields);

    // Fetch product images from Nuvemshop
    const images = await fetchNuvemshopAPI(
      `/products/${productId}/images?${queryParams.toString()}`
    );

    return NextResponse.json({
      success: true,
      data: images,
      pagination: {
        page: parseInt(page),
        per_page: parseInt(perPage),
        total: images.length,
      },
    });
  } catch (error) {
    const resolvedParams = await params;
    console.error(
      `Error fetching Nuvemshop product ${resolvedParams.id} images:`,
      error
    );
    return NextResponse.json(
      {
        error: "Failed to fetch product images",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// POST - Add a new image to a product in Nuvemshop
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const resolvedParams = await params;
    const productId = resolvedParams.id;
    const body = await request.json();

    // Add image to product in Nuvemshop
    const newImage = await fetchNuvemshopAPI(`/products/${productId}/images`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    return NextResponse.json({
      success: true,
      data: newImage,
      message: "Product image added successfully",
    });
  } catch (error) {
    const resolvedParams = await params;
    console.error(
      `Error adding image to Nuvemshop product ${resolvedParams.id}:`,
      error
    );
    return NextResponse.json(
      {
        error: "Failed to add product image",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
