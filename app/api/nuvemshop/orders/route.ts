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

// GET - Fetch orders from Nuvemshop
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

    // Extract query parameters for filtering orders
    const page = searchParams.get("page") || "1";
    const perPage = searchParams.get("per_page") || "50"; // Default 50, max 200
    const since = searchParams.get("since"); // ISO 8601 date
    const until = searchParams.get("until"); // ISO 8601 date
    const createdAtMin = searchParams.get("created_at_min"); // ISO 8601 date
    const createdAtMax = searchParams.get("created_at_max"); // ISO 8601 date
    const updatedAtMin = searchParams.get("updated_at_min"); // ISO 8601 date
    const updatedAtMax = searchParams.get("updated_at_max"); // ISO 8601 date
    const status = searchParams.get("status"); // open, closed, cancelled
    const paymentStatus = searchParams.get("payment_status"); // authorized, pending, paid, etc.
    const shippingStatus = searchParams.get("shipping_status"); // unpacked, packed, shipped, etc.
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
    if (status) queryParams.append("status", status);
    if (paymentStatus) queryParams.append("payment_status", paymentStatus);
    if (shippingStatus) queryParams.append("shipping_status", shippingStatus);
    if (fields) queryParams.append("fields", fields);
    if (q) queryParams.append("q", q);

    // Fetch orders from Nuvemshop
    const orders = await fetchNuvemshopAPI(`/orders?${queryParams.toString()}`);

    return NextResponse.json({
      success: true,
      data: orders,
      pagination: {
        page: parseInt(page),
        per_page: parseInt(perPage),
        total: orders.length,
      },
    });
  } catch (error) {
    console.error("Error fetching Nuvemshop orders:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch orders",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// POST - Sync orders from Nuvemshop to local database
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

    const allOrders = [];
    let currentPage = 1;
    let hasMorePages = true;

    // Fetch all orders in the date range
    while (hasMorePages) {
      const queryParams = new URLSearchParams({
        page: currentPage.toString(),
        per_page: batchSize.toString(),
        created_at_min: createdAtMin,
        created_at_max: createdAtMax,
      });

      const orders = await fetchNuvemshopAPI(
        `/orders?${queryParams.toString()}`
      );

      if (orders && orders.length > 0) {
        allOrders.push(...orders);
        currentPage++;

        // If we got less than the batch size, we've reached the end
        if (orders.length < batchSize) {
          hasMorePages = false;
        }
      } else {
        hasMorePages = false;
      }
    }

    // Store orders in database (you can customize this based on your needs)
    if (allOrders.length > 0) {
      // Transform orders to match your database schema
      const transformedOrders = allOrders.map((order: any) => ({
        nuvemshop_id: order.id,
        order_number: order.number,
        token: order.token,
        store_id: order.store_id,
        contact_email: order.contact_email,
        contact_name: order.contact_name,
        contact_phone: order.contact_phone,
        subtotal: parseFloat(order.subtotal || "0"),
        total: parseFloat(order.total || "0"),
        currency: order.currency,
        status: order.status,
        payment_status: order.payment_status,
        shipping_status: order.shipping_status,
        created_at: order.created_at,
        updated_at: order.updated_at,
        completed_at: order.completed_at?.date || order.created_at,
        cancelled_at: order.cancelled_at,
        closed_at: order.closed_at,
        paid_at: order.paid_at,
        customer_data: order.customer,
        products_data: order.products,
        shipping_address: order.shipping_address,
        gateway: order.gateway,
        gateway_name: order.gateway_name,
        note: order.note,
        owner_note: order.owner_note,
        synced_at: new Date().toISOString(),
      }));

      // Upsert orders to database
      const { error: upsertError } = await supabase
        .from("nuvemshop_orders")
        .upsert(transformedOrders, {
          onConflict: "nuvemshop_id",
        });

      if (upsertError) {
        console.error("Error upserting orders:", upsertError);
        return NextResponse.json(
          { error: "Failed to save orders to database" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: "Orders synced successfully",
      data: {
        totalOrders: allOrders.length,
        syncPeriod: `${syncPeriodDays} days`,
        dateRange: {
          from: createdAtMin,
          to: createdAtMax,
        },
      },
    });
  } catch (error) {
    console.error("Error syncing Nuvemshop orders:", error);
    return NextResponse.json(
      {
        error: "Failed to sync orders",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
