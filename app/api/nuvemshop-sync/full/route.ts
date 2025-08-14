import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const NUVEMSHOP_API_BASE_URL = "https://api.nuvemshop.com.br/v1";
// Updated to fix RLS and schema issues

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

// Helper function to safely parse dates
function safeParseDate(dateString: any): string | null {
  if (!dateString) return null;

  try {
    // Handle if it's already a Date object
    if (dateString instanceof Date) {
      return dateString.toISOString();
    }

    // Handle string dates
    if (typeof dateString === "string") {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        console.warn("Invalid date value:", dateString);
        return null;
      }
      return date.toISOString();
    }

    console.warn("Invalid date value:", dateString);
    return null;
  } catch (error) {
    console.warn("Error parsing date:", dateString, error);
    return null;
  }
}

// Helper function to extract payment method from payment details
function extractPaymentMethod(paymentDetails: any): string | null {
  if (!paymentDetails || !Array.isArray(paymentDetails)) return null;

  const firstPayment = paymentDetails[0];
  return (
    firstPayment?.payment_method?.name || firstPayment?.payment_method || null
  );
}

// Helper function to extract Portuguese name from multilingual object
function extractPortugueseName(nameObj: any): string | null {
  if (!nameObj) return null;

  if (typeof nameObj === "string") return nameObj;

  if (typeof nameObj === "object") {
    return (
      nameObj.pt ||
      nameObj.en ||
      nameObj.es ||
      Object.values(nameObj)[0] ||
      null
    );
  }

  return null;
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

// Process orders and save to database
async function processOrders(orders: any[], supabase: any) {
  const processedOrders = [];
  let newRecords = 0;
  const updatedRecords = 0;
  let errorRecords = 0;

  for (const order of orders) {
    try {
      // Extract shipping address safely
      const shippingAddress = order.shipping_address || {};

      const processedOrder = {
        order_id: order.id.toString(),
        order_number: order.number || null,

        // Order dates
        completed_at: safeParseDate(order.completed_at),
        created_at_nuvemshop: safeParseDate(order.created_at),

        // Customer information
        contact_name: order.contact_name || null,
        shipping_address: shippingAddress,
        province: shippingAddress.province || null,

        // Products (JSONB array)
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
        if (data && data.length > 0) {
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

// Process products and save to database
async function processProducts(products: any[], supabase: any) {
  const processedProducts = [];
  let newRecords = 0;
  const updatedRecords = 0;
  let errorRecords = 0;

  for (const product of products) {
    try {
      // Extract featured image information
      const featuredImageId = product.featured_image?.id || null;
      const featuredImageSrc = product.featured_image?.src || null;

      const processedProduct = {
        product_id: product.id.toString(),

        // Product basic info
        name: product.name || null,
        name_pt: extractPortugueseName(product.name),

        // Product details
        brand: product.brand || null,
        description: product.description?.pt || product.description || null,
        handle: product.handle || null,
        canonical_url: product.canonical_url || null,

        // Product variants
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
        if (data && data.length > 0) {
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

// Main full sync function
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerForSync();

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const ordersLimit = parseInt(searchParams.get("orders_limit") || "100");
    const productsLimit = parseInt(searchParams.get("products_limit") || "100");
    const ordersPages = parseInt(searchParams.get("orders_pages") || "1");
    const productsPages = parseInt(searchParams.get("products_pages") || "1");

    // Start sync log for full sync
    const syncStartTime = new Date();
    const { data: syncLog, error: syncLogError } = await supabase
      .from("nuvemshop_sync_log")
      .insert({
        sync_type: "full",
        status: "running",
        started_at: syncStartTime.toISOString(),
        triggered_by: "manual",
      })
      .select("id")
      .single();

    if (syncLogError) {
      throw new Error(`Failed to create sync log: ${syncLogError.message}`);
    }

    const results = {
      orders: {
        total_synced: 0,
        total_errors: 0,
        pages_processed: 0,
        sync_logs: [] as string[],
      },
      products: {
        total_synced: 0,
        total_errors: 0,
        pages_processed: 0,
        sync_logs: [] as string[],
      },
    };

    let totalRecords = 0;
    let processedRecords = 0;
    let errorRecords = 0;

    try {
      // Sync Orders (multiple pages if requested)
      console.log(
        `Starting orders sync: ${ordersPages} pages with ${ordersLimit} items each`
      );

      for (let page = 1; page <= ordersPages; page++) {
        try {
          // Fetch orders from Nuvemshop API
          const endpoint = `/orders?limit=${ordersLimit}&page=${page}&status=any`;
          const ordersResponse = await fetchNuvemshopAPI(endpoint);
          const orders = ordersResponse.orders || ordersResponse;

          // Process and save orders
          const { processedOrders, stats } = await processOrders(
            orders,
            supabase
          );

          results.orders.total_synced += processedOrders.length;
          results.orders.total_errors += stats.errorRecords;
          results.orders.pages_processed++;

          totalRecords += orders.length;
          processedRecords += processedOrders.length;
          errorRecords += stats.errorRecords;

          console.log(
            `Orders page ${page}: ${processedOrders.length} processed, ${stats.errorRecords} errors`
          );
        } catch (error) {
          console.error(`Error syncing orders page ${page}:`, error);
          results.orders.total_errors++;
        }

        // Add a small delay between pages to avoid rate limiting
        if (page < ordersPages) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      // Sync Products (multiple pages if requested)
      console.log(
        `Starting products sync: ${productsPages} pages with ${productsLimit} items each`
      );

      for (let page = 1; page <= productsPages; page++) {
        try {
          // Fetch products from Nuvemshop API
          const endpoint = `/products?limit=${productsLimit}&page=${page}&published=true`;
          const productsResponse = await fetchNuvemshopAPI(endpoint);
          const products = productsResponse.products || productsResponse;

          // Process and save products
          const { processedProducts, stats } = await processProducts(
            products,
            supabase
          );

          results.products.total_synced += processedProducts.length;
          results.products.total_errors += stats.errorRecords;
          results.products.pages_processed++;

          totalRecords += products.length;
          processedRecords += processedProducts.length;
          errorRecords += stats.errorRecords;

          console.log(
            `Products page ${page}: ${processedProducts.length} processed, ${stats.errorRecords} errors`
          );
        } catch (error) {
          console.error(`Error syncing products page ${page}:`, error);
          results.products.total_errors++;
        }

        // Add a small delay between pages to avoid rate limiting
        if (page < productsPages) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

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
          total_records: totalRecords,
          processed_records: processedRecords,
          new_records: processedRecords, // Simplified for now
          updated_records: 0,
          error_records: errorRecords,
        })
        .eq("id", syncLog.id);

      return NextResponse.json({
        success: true,
        message: `Full sync completed successfully`,
        summary: {
          total_duration_seconds: durationSeconds,
          total_records: totalRecords,
          total_processed: processedRecords,
          total_errors: errorRecords,
        },
        details: results,
        sync_log_id: syncLog.id,
      });
    } catch (error) {
      // Update sync log with failure
      const syncEndTime = new Date();
      const durationSeconds = Math.floor(
        (syncEndTime.getTime() - syncStartTime.getTime()) / 1000
      );

      await supabase
        .from("nuvemshop_sync_log")
        .update({
          status: "failed",
          completed_at: syncEndTime.toISOString(),
          duration_seconds: durationSeconds,
          total_records: totalRecords,
          processed_records: processedRecords,
          error_records: errorRecords,
          error_message:
            error instanceof Error ? error.message : "Unknown error",
          error_details: {
            results,
            error: error instanceof Error ? error.stack : String(error),
          },
        })
        .eq("id", syncLog.id);

      throw error;
    }
  } catch (error) {
    console.error("Nuvemshop full sync error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
        details: error instanceof Error ? error.stack : String(error),
      },
      { status: 500 }
    );
  }
}

// GET method to get sync status and recent logs
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { searchParams } = new URL(request.url);

    const limit = parseInt(searchParams.get("limit") || "10");

    // Get recent sync logs
    const { data: syncLogs, error } = await supabase
      .from("nuvemshop_sync_log")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    // Get last sync status for each type
    const { data: lastOrdersSync } = await supabase.rpc(
      "get_last_nuvemshop_sync_status",
      { sync_type_param: "orders" }
    );

    const { data: lastProductsSync } = await supabase.rpc(
      "get_last_nuvemshop_sync_status",
      { sync_type_param: "products" }
    );

    const { data: lastFullSync } = await supabase.rpc(
      "get_last_nuvemshop_sync_status",
      { sync_type_param: "full" }
    );

    return NextResponse.json({
      success: true,
      recent_logs: syncLogs || [],
      last_sync_status: {
        orders: lastOrdersSync?.[0] || null,
        products: lastProductsSync?.[0] || null,
        full: lastFullSync?.[0] || null,
      },
    });
  } catch (error) {
    console.error("Error fetching sync status:", error);

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
