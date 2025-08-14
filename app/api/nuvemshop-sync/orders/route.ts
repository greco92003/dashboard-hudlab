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

// Function to extract province from shipping address
function extractProvince(shippingAddress: any): string | null {
  if (!shippingAddress) return null;

  // Try different possible fields for province/state
  return (
    shippingAddress.province ||
    shippingAddress.state ||
    shippingAddress.region ||
    null
  );
}

// Function to extract payment method from payment details
function extractPaymentMethod(paymentDetails: any): string | null {
  if (!paymentDetails) return null;

  // Handle both array and object formats
  if (Array.isArray(paymentDetails)) {
    const firstPayment = paymentDetails[0];
    return firstPayment?.payment_method?.name || firstPayment?.method || null;
  }

  // Handle object format (which seems to be the current structure)
  return paymentDetails.method || null;
}

// Helper function to safely parse dates
function safeParseDate(dateValue: any): string | null {
  if (!dateValue) return null;

  try {
    const date = new Date(dateValue);
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      console.warn(`Invalid date value: ${dateValue}`);
      return null;
    }
    return date.toISOString();
  } catch (error) {
    console.warn(`Error parsing date: ${dateValue}`, error);
    return null;
  }
}

// Processar campo coupon de forma inteligente
function processCoupon(couponData: any): string | null {
  if (!couponData) return null;

  // Se for uma string vazia ou null, retornar null
  if (typeof couponData === "string") {
    const trimmed = couponData.trim();
    if (trimmed === "" || trimmed === "null" || trimmed === "undefined") {
      return null;
    }
    return trimmed;
  }

  // Se for um array (como no exemplo do webhook)
  if (Array.isArray(couponData)) {
    // Se o array está vazio, não há cupom aplicado
    if (couponData.length === 0) {
      return null;
    }

    // Se há cupons no array, mas queremos verificar se algum foi realmente usado
    // Para sincronização manual, vamos assumir que se há cupons no array, pelo menos um foi usado
    // (a API da Nuvemshop geralmente só retorna cupons que foram aplicados)
    if (couponData.length > 0 && couponData[0].code) {
      return couponData[0].code;
    }

    return null;
  }

  // Se for um objeto, extrair o código
  if (typeof couponData === "object" && couponData.code) {
    return couponData.code;
  }

  return null;
}

// Function to process and save orders to Supabase
async function processOrders(orders: any[], supabase: any) {
  const processedOrders = [];
  let newRecords = 0;
  const updatedRecords = 0;
  let errorRecords = 0;

  for (const order of orders) {
    try {
      // Debug customer and payment information
      console.log(
        `Order ${order.id}: Contact name = ${order.contact_name}, Payment status = ${order.payment_status}, Customer object:`,
        order.customer,
        "Billing address:",
        order.billing_address,
        "Shipping address:",
        order.shipping_address
      );

      // Debug payment status specifically
      console.log(`Order ${order.id} payment_status:`, order.payment_status);
      console.log(
        `Order ${order.id} full order object keys:`,
        Object.keys(order)
      );

      // Extract and process order data according to the structure you specified
      const processedOrder = {
        order_id: order.id.toString(),
        order_number: order.number || order.name,
        completed_at: safeParseDate(order.completed_at),
        created_at_nuvemshop: safeParseDate(order.created_at),

        // Customer information
        contact_name: order.contact_name || null,
        shipping_address: order.shipping_address || null,
        province: extractProvince(order.shipping_address),

        // Products in order
        products: order.products || [],

        // Order totals
        subtotal: order.subtotal ? parseFloat(order.subtotal) : null,
        shipping_cost_customer: order.shipping_cost_customer
          ? parseFloat(order.shipping_cost_customer)
          : null,
        coupon: processCoupon(order.coupon),
        promotional_discount: order.promotional_discount
          ? parseFloat(order.promotional_discount)
          : null,
        total_discount_amount: order.total_discount_amount
          ? parseFloat(order.total_discount_amount)
          : null,
        discount_coupon: order.discount_coupon
          ? parseFloat(order.discount_coupon)
          : null,
        discount_gateway: order.discount_gateway
          ? parseFloat(order.discount_gateway)
          : null,
        total: order.total ? parseFloat(order.total) : null,

        // Payment information
        payment_details: order.payment_details || null,
        payment_method: extractPaymentMethod(order.payment_details),
        payment_status: order.payment_status || null,

        // Order status
        status: order.status || null,
        fulfillment_status: order.fulfillment_status || null,

        // Sync metadata
        last_synced_at: new Date().toISOString(),
        api_updated_at: safeParseDate(order.updated_at),
        sync_status: "synced" as const,
      };

      // Upsert order to Supabase
      const { data, error } = await supabase
        .from("nuvemshop_orders")
        .upsert(processedOrder, {
          onConflict: "order_id",
          ignoreDuplicates: false,
        })
        .select("*");

      if (error) {
        console.error(`Error upserting order ${order.id}:`, error);
        errorRecords++;
      } else {
        // Check if it was an insert or update
        if (data && data.length > 0) {
          // For simplicity, we'll count all as new records
          // In a real implementation, you'd check if the record existed before
          newRecords++;
        }
        processedOrders.push(processedOrder);
      }
    } catch (error) {
      console.error(`Error processing order ${order.id}:`, error);
      errorRecords++;
    }
  }

  return {
    processedOrders,
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
    const status = searchParams.get("status") || "any"; // open, closed, cancelled, any

    // Start sync log
    const syncStartTime = new Date();
    const { data: syncLog, error: syncLogError } = await supabase
      .from("nuvemshop_sync_log")
      .insert({
        sync_type: "orders",
        status: "running",
        started_at: syncStartTime.toISOString(),
        triggered_by: "manual",
      })
      .select("id")
      .single();

    if (syncLogError) {
      throw new Error(`Failed to create sync log: ${syncLogError.message}`);
    }

    // Fetch orders from Nuvemshop API
    let endpoint = `/orders?limit=${limit}&page=${page}`;
    if (status !== "any") {
      endpoint += `&status=${status}`;
    }

    const ordersResponse = await fetchNuvemshopAPI(endpoint);
    const orders = ordersResponse.orders || ordersResponse;

    // Process and save orders
    const { processedOrders, stats } = await processOrders(orders, supabase);

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
        total_records: orders.length,
        processed_records: processedOrders.length,
        new_records: stats.newRecords,
        updated_records: stats.updatedRecords,
        error_records: stats.errorRecords,
      })
      .eq("id", syncLog.id);

    return NextResponse.json({
      success: true,
      message: `Successfully synced ${processedOrders.length} orders`,
      stats: {
        total_fetched: orders.length,
        processed: processedOrders.length,
        new_records: stats.newRecords,
        updated_records: stats.updatedRecords,
        error_records: stats.errorRecords,
        duration_seconds: durationSeconds,
      },
      sync_log_id: syncLog.id,
    });
  } catch (error) {
    console.error("Nuvemshop orders sync error:", error);

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

// GET method to fetch orders from database
export async function GET(request: NextRequest) {
  try {
    // Use regular Supabase client for GET operations (needs auth)
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
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const customer = searchParams.get("customer");
    const selectedBrand = searchParams.get("brand"); // Brand filter for owners/admins

    // Determine which brand to filter by
    let brandToFilter: string | null = null;

    // For partners-media users, use their assigned brand
    if (userProfile.role === "partners-media" && userProfile.assigned_brand) {
      brandToFilter = userProfile.assigned_brand;
    }
    // For owners/admins, use the selected brand from query params
    else if (["owner", "admin"].includes(userProfile.role)) {
      if (selectedBrand && selectedBrand !== "all") {
        brandToFilter = selectedBrand;
      }
      // If selectedBrand is "all" or null, brandToFilter remains null (no filtering)
    }

    const query = supabase
      .from("nuvemshop_orders")
      .select("*")
      .eq("sync_status", "synced")
      .eq("payment_status", "paid"); // Only show orders with payment status "paid"

    // Simple approach: get all orders, filter by brand if needed, then paginate
    let allQuery = supabase
      .from("nuvemshop_orders")
      .select("*")
      .eq("sync_status", "synced")
      .eq("payment_status", "paid")
      .order("created_at_nuvemshop", { ascending: false });

    // Add date filters if provided
    if (startDate && endDate) {
      allQuery = allQuery
        .gte("created_at_nuvemshop", `${startDate}T00:00:00.000Z`)
        .lte("created_at_nuvemshop", `${endDate}T23:59:59.999Z`);
    }

    // Add customer filter if provided
    if (customer) {
      allQuery = allQuery.ilike("contact_name", `%${customer}%`);
    }

    const { data: allOrders, error: allOrdersError } = await allQuery;

    if (allOrdersError) {
      throw new Error(`Database error: ${allOrdersError.message}`);
    }

    let finalOrders = allOrders || [];

    // Filter by brand if specified
    if (brandToFilter) {
      // Get all product IDs from orders
      const productIds = new Set<string>();
      finalOrders.forEach((order) => {
        if (order.products && Array.isArray(order.products)) {
          order.products.forEach((product: any) => {
            if (product.product_id) {
              productIds.add(product.product_id.toString());
            }
          });
        }
      });

      if (productIds.size > 0) {
        // Get products with their brands from nuvemshop_products table
        const { data: productsWithBrands } = await supabase
          .from("nuvemshop_products")
          .select("product_id, brand")
          .in("product_id", Array.from(productIds));

        // Create a map of product_id to brand
        const productBrandMap = new Map<string, string>();
        (productsWithBrands || []).forEach((product) => {
          if (product.product_id && product.brand) {
            productBrandMap.set(product.product_id.toString(), product.brand);
          }
        });

        // Filter orders based on brand information
        finalOrders = finalOrders.filter((order) => {
          if (!order.products || !Array.isArray(order.products)) {
            return false;
          }

          // Check if any product in the order matches the target brand
          return order.products.some((product: any) => {
            if (!product.product_id) return false;
            const productBrand = productBrandMap.get(
              product.product_id.toString()
            );
            return productBrand === brandToFilter;
          });
        });
      }
    }

    // Apply pagination to final results
    const totalCount = finalOrders.length;
    const paginatedOrders = finalOrders.slice(offset, offset + limit);

    console.log(
      `API Response: total=${totalCount}, count=${paginatedOrders.length}, brand=${brandToFilter}`
    );

    return NextResponse.json({
      success: true,
      orders: paginatedOrders,
      total: totalCount,
      count: paginatedOrders.length,
      filtered_by_brand: brandToFilter,
    });
  } catch (error) {
    console.error("Error fetching orders:", error);

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
