import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

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

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    data: response.ok ? await response.json() : await response.text(),
    headers: Object.fromEntries(response.headers.entries()),
  };
}

// GET - Test Nuvemshop API authentication and permissions
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is approved and has permission
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("approved, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.approved) {
      return NextResponse.json({ error: "User not approved" }, { status: 403 });
    }

    const allowedRoles = ["owner", "admin"];
    if (!allowedRoles.includes(profile.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    console.log("Testing Nuvemshop API authentication and permissions...");

    const tests = [];

    // Test 1: Get store info (should always work)
    try {
      const storeResult = await fetchNuvemshopAPI("/store");
      tests.push({
        test: "Store Info",
        endpoint: "/store",
        success: storeResult.ok,
        status: storeResult.status,
        data: storeResult.ok ? "Store data retrieved" : storeResult.data,
      });
    } catch (error) {
      tests.push({
        test: "Store Info",
        endpoint: "/store",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    // Test 2: Get products (requires read_products)
    try {
      const productsResult = await fetchNuvemshopAPI("/products?limit=1");
      tests.push({
        test: "Products",
        endpoint: "/products",
        success: productsResult.ok,
        status: productsResult.status,
        data: productsResult.ok ? "Products data retrieved" : productsResult.data,
      });
    } catch (error) {
      tests.push({
        test: "Products",
        endpoint: "/products",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    // Test 3: Get orders (requires read_orders)
    try {
      const ordersResult = await fetchNuvemshopAPI("/orders?limit=1");
      tests.push({
        test: "Orders",
        endpoint: "/orders",
        success: ordersResult.ok,
        status: ordersResult.status,
        data: ordersResult.ok ? "Orders data retrieved" : ordersResult.data,
      });
    } catch (error) {
      tests.push({
        test: "Orders",
        endpoint: "/orders",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    // Test 4: Get coupons (requires read_coupons)
    try {
      const couponsResult = await fetchNuvemshopAPI("/coupons?limit=1");
      tests.push({
        test: "Coupons",
        endpoint: "/coupons",
        success: couponsResult.ok,
        status: couponsResult.status,
        data: couponsResult.ok ? couponsResult.data : couponsResult.data,
      });
    } catch (error) {
      tests.push({
        test: "Coupons",
        endpoint: "/coupons",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    // Test 5: Try to create a test coupon (requires write_coupons)
    try {
      const testCouponPayload = {
        code: "TEST_AUTH_" + Date.now(),
        type: "percentage",
        value: "5",
        valid: true,
        max_uses: 1,
        start_date: new Date().toISOString().split("T")[0],
        end_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        min_price: 0,
        first_consumer_purchase: false,
        combines_with_other_discounts: false,
        includes_shipping: false,
      };

      const createCouponResult = await fetchNuvemshopAPI("/coupons", {
        method: "POST",
        body: JSON.stringify(testCouponPayload),
      });

      tests.push({
        test: "Create Coupon",
        endpoint: "POST /coupons",
        success: createCouponResult.ok,
        status: createCouponResult.status,
        data: createCouponResult.ok ? "Test coupon created" : createCouponResult.data,
        payload: testCouponPayload,
      });
    } catch (error) {
      tests.push({
        test: "Create Coupon",
        endpoint: "POST /coupons",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    return NextResponse.json({
      success: true,
      message: "Nuvemshop API authentication tests completed",
      credentials: {
        hasAccessToken: !!process.env.NUVEMSHOP_ACCESS_TOKEN,
        hasUserId: !!process.env.NUVEMSHOP_USER_ID,
        userIdLength: process.env.NUVEMSHOP_USER_ID?.length || 0,
      },
      tests: tests,
    });
  } catch (error) {
    console.error("Error in auth test:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Auth test failed",
      },
      { status: 500 }
    );
  }
}
