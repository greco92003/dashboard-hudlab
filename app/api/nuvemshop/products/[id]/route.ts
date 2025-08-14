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

// GET - Fetch a specific product by ID from Nuvemshop
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
    const fields = searchParams.get("fields"); // Specific fields to return

    // Build query parameters for Nuvemshop API
    const queryParams = new URLSearchParams();
    if (fields) queryParams.append("fields", fields);

    const queryString = queryParams.toString();
    const endpoint = `/products/${productId}${
      queryString ? `?${queryString}` : ""
    }`;

    // Fetch specific product from Nuvemshop
    const product = await fetchNuvemshopAPI(endpoint);

    return NextResponse.json({
      success: true,
      data: product,
    });
  } catch (error) {
    const resolvedParams = await params;
    console.error(
      `Error fetching Nuvemshop product ${resolvedParams.id}:`,
      error
    );
    return NextResponse.json(
      {
        error: "Failed to fetch product",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// PUT - Update a specific product in Nuvemshop
export async function PUT(
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

    // Update product in Nuvemshop
    const updatedProduct = await fetchNuvemshopAPI(`/products/${productId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });

    return NextResponse.json({
      success: true,
      data: updatedProduct,
      message: "Product updated successfully",
    });
  } catch (error) {
    const resolvedParams = await params;
    console.error(
      `Error updating Nuvemshop product ${resolvedParams.id}:`,
      error
    );
    return NextResponse.json(
      {
        error: "Failed to update product",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// DELETE - Delete a specific product in Nuvemshop
export async function DELETE(
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

    // Delete product in Nuvemshop
    await fetchNuvemshopAPI(`/products/${productId}`, {
      method: "DELETE",
    });

    return NextResponse.json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    const resolvedParams = await params;
    console.error(
      `Error deleting Nuvemshop product ${resolvedParams.id}:`,
      error
    );
    return NextResponse.json(
      {
        error: "Failed to delete product",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
