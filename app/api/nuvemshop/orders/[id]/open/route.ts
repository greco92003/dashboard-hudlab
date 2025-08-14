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

// POST - Reopen a closed order in Nuvemshop
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
    const orderId = resolvedParams.id;

    // Reopen order in Nuvemshop
    const reopenedOrder = await fetchNuvemshopAPI(`/orders/${orderId}/open`, {
      method: "POST",
    });

    return NextResponse.json({
      success: true,
      data: reopenedOrder,
      message: "Order reopened successfully",
    });
  } catch (error) {
    const resolvedParams = await params;
    console.error(
      `Error reopening Nuvemshop order ${resolvedParams.id}:`,
      error
    );
    return NextResponse.json(
      {
        error: "Failed to reopen order",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
