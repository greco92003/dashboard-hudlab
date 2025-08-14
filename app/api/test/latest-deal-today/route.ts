import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Environment variables
const BASE_URL = process.env.NEXT_PUBLIC_AC_BASE_URL;
const API_TOKEN = process.env.AC_API_TOKEN;

const headers = {
  "Api-Token": API_TOKEN || "",
  "Content-Type": "application/json",
};

// Create Supabase client with service role key
async function createSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );
}

async function fetchJSON(url: string, timeout = 15000) {
  console.log("Fetching URL:", url);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const res = await fetch(url, {
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    return await res.json();
  } catch (error) {
    console.error("Fetch error:", error);
    throw error;
  }
}

// Helper function to format date for ActiveCampaign API (YYYY-MM-DD format)
function formatDateForAPI(date: Date): string {
  return date.toISOString().split("T")[0];
}

// Helper function to get today's date in Brazil timezone
function getTodayInBrazil(): string {
  const today = new Date();
  // Convert to Brazil timezone (UTC-3)
  const brazilTime = new Date(today.getTime() - 3 * 60 * 60 * 1000);
  return formatDateForAPI(brazilTime);
}

// GET endpoint to fetch the latest deal created today
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

    // Validate environment variables
    if (!BASE_URL || !API_TOKEN) {
      return NextResponse.json(
        { error: "ActiveCampaign credentials not configured" },
        { status: 500 }
      );
    }

    console.log(
      "🔍 Testing multiple approaches to find deals created today (08/06/2025)..."
    );

    const todayDate = "2025-06-08"; // Fixed date as requested
    console.log(`📅 Target date: ${todayDate}`);

    const tests = [];

    // Test 1: Get recent deals without filters to check API connectivity
    console.log("🧪 Test 1: Fetching recent deals without filters...");
    try {
      const recentDealsUrl = `${BASE_URL}/api/3/deals?orders[cdate]=DESC&limit=10`;
      const recentDealsResponse = await fetchJSON(recentDealsUrl);

      tests.push({
        test: "Recent deals (no filter)",
        url: recentDealsUrl,
        success: true,
        totalDeals: recentDealsResponse.deals?.length || 0,
        sampleDeals:
          recentDealsResponse.deals?.slice(0, 3).map((deal: any) => ({
            id: deal.id,
            title: deal.title,
            cdate: deal.cdate,
            value: deal.value,
          })) || [],
      });

      console.log(
        `✅ Found ${recentDealsResponse.deals?.length || 0} recent deals`
      );
    } catch (error) {
      tests.push({
        test: "Recent deals (no filter)",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      console.error("❌ Test 1 failed:", error);
    }

    // Test 2: Try original filter format
    console.log("🧪 Test 2: Original filter format...");
    try {
      const originalUrl = `${BASE_URL}/api/3/deals?filters[cdate]=${todayDate}&orders[cdate]=DESC&limit=10`;
      const originalResponse = await fetchJSON(originalUrl);

      tests.push({
        test: "Original filter (filters[cdate])",
        url: originalUrl,
        success: true,
        totalDeals: originalResponse.deals?.length || 0,
        deals: originalResponse.deals || [],
      });

      console.log(
        `✅ Original filter found ${originalResponse.deals?.length || 0} deals`
      );
    } catch (error) {
      tests.push({
        test: "Original filter (filters[cdate])",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      console.error("❌ Test 2 failed:", error);
    }

    // Test 3: Try different date filter approaches based on ActiveCampaign docs
    console.log("🧪 Test 3: Different date filter approaches...");

    const filterTests = [
      {
        name: "cdate exact match (YYYY-MM-DD)",
        url: `${BASE_URL}/api/3/deals?filters[cdate]=2025-06-08&limit=10`,
      },
      {
        name: "cdate with time range start",
        url: `${BASE_URL}/api/3/deals?filters[cdate]=2025-06-08T00:00:00&limit=10`,
      },
      {
        name: "cdate contains pattern",
        url: `${BASE_URL}/api/3/deals?filters[cdate]=2025-06-08&limit=10`,
      },
      {
        name: "created_timestamp if available",
        url: `${BASE_URL}/api/3/deals?filters[created_timestamp]=2025-06-08&limit=10`,
      },
      {
        name: "date_created if available",
        url: `${BASE_URL}/api/3/deals?filters[date_created]=2025-06-08&limit=10`,
      },
      {
        name: "cdate range with orders",
        url: `${BASE_URL}/api/3/deals?filters[cdate]=2025-06-08&orders[cdate]=DESC&limit=10`,
      },
    ];

    for (const filterTest of filterTests) {
      try {
        console.log(`Testing: ${filterTest.name}`);
        const filterResponse = await fetchJSON(filterTest.url);

        tests.push({
          test: filterTest.name,
          url: filterTest.url,
          success: true,
          totalDeals: filterResponse.deals?.length || 0,
          sampleDeals:
            filterResponse.deals?.slice(0, 2).map((deal: any) => ({
              id: deal.id,
              title: deal.title,
              cdate: deal.cdate,
            })) || [],
        });

        console.log(
          `✅ ${filterTest.name}: found ${
            filterResponse.deals?.length || 0
          } deals`
        );
      } catch (error) {
        tests.push({
          test: filterTest.name,
          url: filterTest.url,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        console.error(`❌ ${filterTest.name} failed:`, error);
      }
    }

    // Test 4: Check if any recent deals were created today by comparing dates
    console.log("🧪 Test 4: Manual date comparison...");
    try {
      const allRecentUrl = `${BASE_URL}/api/3/deals?orders[cdate]=DESC&limit=50`;
      const allRecentResponse = await fetchJSON(allRecentUrl);

      const todaysDeals =
        allRecentResponse.deals?.filter((deal: any) => {
          if (!deal.cdate) return false;

          // Extract date part from cdate (format: YYYY-MM-DD HH:MM:SS)
          const dealDate = deal.cdate.split(" ")[0]; // Get YYYY-MM-DD part
          return dealDate === todayDate;
        }) || [];

      tests.push({
        test: "Manual date comparison",
        url: allRecentUrl,
        success: true,
        totalDeals: allRecentResponse.deals?.length || 0,
        todaysDeals: todaysDeals.length,
        todaysDealsData: todaysDeals.map((deal: any) => ({
          id: deal.id,
          title: deal.title,
          cdate: deal.cdate,
          value: deal.value,
        })),
      });

      console.log(
        `✅ Manual comparison found ${todaysDeals.length} deals created today`
      );

      // If we found deals created today, return them
      if (todaysDeals.length > 0) {
        const latestDeal = todaysDeals[0];

        // Get detailed information about the latest deal
        const dealDetailUrl = `${BASE_URL}/api/3/deals/${latestDeal.id}`;
        const dealDetailResponse = await fetchJSON(dealDetailUrl);
        const dealDetail = dealDetailResponse.deal;

        // Get custom field values for this deal
        const customFieldsUrl = `${BASE_URL}/api/3/deals/${latestDeal.id}/dealCustomFieldData`;
        let customFields = [];
        try {
          const customFieldsResponse = await fetchJSON(customFieldsUrl);
          customFields = customFieldsResponse.dealCustomFieldData || [];
        } catch (error) {
          console.warn("⚠️ Could not fetch custom fields:", error);
        }

        return NextResponse.json({
          success: true,
          message: `Latest deal created on ${todayDate} found via manual comparison`,
          searchDate: todayDate,
          totalDealsFound: todaysDeals.length,
          latestDeal: {
            id: dealDetail.id,
            title: dealDetail.title,
            value: dealDetail.value,
            currency: dealDetail.currency,
            status: dealDetail.status,
            stage: dealDetail.stage,
            owner: dealDetail.owner,
            contact: dealDetail.contact,
            organization: dealDetail.organization,
            createdAt: dealDetail.cdate,
            updatedAt: dealDetail.udate,
            customFields: customFields.map((cf: any) => ({
              fieldId: cf.customFieldId,
              fieldValue: cf.fieldValue,
              createdAt: cf.cdate,
              updatedAt: cf.udate,
            })),
          },
          allDealsToday: todaysDeals.map((deal: any) => ({
            id: deal.id,
            title: deal.title,
            value: deal.value,
            createdAt: deal.cdate,
          })),
          tests: tests,
          debug: {
            dealsUrl: allRecentUrl,
            dealDetailUrl,
            customFieldsUrl,
            timestamp: new Date().toISOString(),
            environment: {
              hasBaseUrl: !!BASE_URL,
              hasApiToken: !!API_TOKEN,
              baseUrl: BASE_URL,
              apiTokenLength: API_TOKEN?.length || 0,
            },
          },
        });
      }
    } catch (error) {
      tests.push({
        test: "Manual date comparison",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      console.error("❌ Test 4 failed:", error);
    }

    // If no deals found, return test results
    return NextResponse.json({
      success: true,
      message: `No deals found created on ${todayDate} - see test results for details`,
      searchDate: todayDate,
      totalDealsFound: 0,
      tests: tests,
      debug: {
        timestamp: new Date().toISOString(),
        environment: {
          hasBaseUrl: !!BASE_URL,
          hasApiToken: !!API_TOKEN,
          baseUrl: BASE_URL,
          apiTokenLength: API_TOKEN?.length || 0,
        },
      },
    });
  } catch (error) {
    console.error("❌ Error in latest deal test:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Test failed",
        stack: error instanceof Error ? error.stack : null,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
