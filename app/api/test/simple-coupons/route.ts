import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// Nuvemshop API configuration
const NUVEMSHOP_API_BASE_URL = "https://api.nuvemshop.com.br/v1";

// GET - Simple test to fetch coupons from Nuvemshop
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

    const accessToken = process.env.NUVEMSHOP_ACCESS_TOKEN;
    const userId = process.env.NUVEMSHOP_USER_ID;

    if (!accessToken || !userId) {
      return NextResponse.json(
        { error: "Nuvemshop credentials not configured" },
        { status: 500 }
      );
    }

    console.log("Testing simple coupons fetch...");
    console.log("User ID:", userId);
    console.log("Access Token length:", accessToken.length);

    // Test different endpoints and authentication methods
    const tests = [];

    // Test 1: Simple /coupons with Authentication header
    try {
      const url1 = `${NUVEMSHOP_API_BASE_URL}/${userId}/coupons`;
      console.log("Testing URL:", url1);

      const response1 = await fetch(url1, {
        method: "GET",
        headers: {
          Authentication: `bearer ${accessToken}`,
          "Content-Type": "application/json",
          "User-Agent": "HudLab Dashboard (contato@hudlab.com.br)",
        },
      });

      const result1: any = {
        endpoint: "/coupons (Authentication header)",
        url: url1,
        status: response1.status,
        statusText: response1.statusText,
        ok: response1.ok,
        headers: Object.fromEntries(response1.headers.entries()),
      };

      if (response1.ok) {
        result1.data = await response1.json();
      } else {
        result1.error = await response1.text();
      }

      tests.push(result1);
    } catch (error) {
      tests.push({
        endpoint: "/coupons (Authentication header)",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    // Test 2: Try with Authorization header (just to compare)
    try {
      const url2 = `${NUVEMSHOP_API_BASE_URL}/${userId}/coupons`;
      console.log("Testing URL with Authorization header:", url2);

      const response2 = await fetch(url2, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "User-Agent": "HudLab Dashboard (contato@hudlab.com.br)",
        },
      });

      const result2: any = {
        endpoint: "/coupons (Authorization header)",
        url: url2,
        status: response2.status,
        statusText: response2.statusText,
        ok: response2.ok,
      };

      if (response2.ok) {
        result2.data = await response2.json();
      } else {
        result2.error = await response2.text();
      }

      tests.push(result2);
    } catch (error) {
      tests.push({
        endpoint: "/coupons (Authorization header)",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    // Test 3: /coupons with limit parameter
    try {
      const url3 = `${NUVEMSHOP_API_BASE_URL}/${userId}/coupons?limit=5`;
      console.log("Testing URL:", url3);

      const response3 = await fetch(url3, {
        method: "GET",
        headers: {
          Authentication: `bearer ${accessToken}`,
          "Content-Type": "application/json",
          "User-Agent": "HudLab Dashboard (contato@hudlab.com.br)",
        },
      });

      const result3: any = {
        endpoint: "/coupons?limit=5",
        url: url3,
        status: response3.status,
        statusText: response3.statusText,
        ok: response3.ok,
      };

      if (response3.ok) {
        result3.data = await response3.json();
      } else {
        result3.error = await response3.text();
      }

      tests.push(result3);
    } catch (error) {
      tests.push({
        endpoint: "/coupons?limit=5",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    // Test 4: Compare with working products endpoint
    try {
      const url4 = `${NUVEMSHOP_API_BASE_URL}/${userId}/products?limit=1`;
      console.log("Testing products URL for comparison:", url4);

      const response4 = await fetch(url4, {
        method: "GET",
        headers: {
          Authentication: `bearer ${accessToken}`,
          "Content-Type": "application/json",
          "User-Agent": "HudLab Dashboard (contato@hudlab.com.br)",
        },
      });

      const result4: any = {
        endpoint: "/products?limit=1 (for comparison)",
        url: url4,
        status: response4.status,
        statusText: response4.statusText,
        ok: response4.ok,
      };

      if (response4.ok) {
        const data = await response4.json();
        result4.data = `Products found: ${data.products?.length || 0}`;
      } else {
        result4.error = await response4.text();
      }

      tests.push(result4);
    } catch (error) {
      tests.push({
        endpoint: "/products?limit=1 (for comparison)",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    return NextResponse.json({
      success: true,
      message: "Simple coupons test completed",
      environment: {
        hasAccessToken: !!accessToken,
        hasUserId: !!userId,
        userIdLength: userId?.length || 0,
        accessTokenPrefix: accessToken?.substring(0, 10) + "...",
      },
      tests: tests,
    });
  } catch (error) {
    console.error("Error in simple coupons test:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Test failed",
        stack: error instanceof Error ? error.stack : null,
      },
      { status: 500 }
    );
  }
}
