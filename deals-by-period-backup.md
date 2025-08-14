import { NextRequest, NextResponse } from "next/server";

// Environment variables
const BASE_URL = process.env.NEXT_PUBLIC_AC_BASE_URL;
const API_TOKEN = process.env.AC_API_TOKEN;

const headers = {
"Api-Token": API_TOKEN || "",
"Content-Type": "application/json",
};

async function fetchJSON(url: string) {
console.log("Fetching URL:", url);
try {
const res = await fetch(url, { headers });
console.log("Response status:", res.status);

    if (!res.ok) {
      const errorText = await res.text();
      console.error("API Error:", errorText);
      throw new Error(`Erro na API: ${errorText}`);
    }
    return res.json();

} catch (error) {
console.error("Fetch error:", error);
throw error;
}
}

// Function to fetch all deals with pagination
async function fetchAllDeals() {
let allDeals: any[] = [];
let offset = 0;
const limit = 100; // Maximum allowed by ActiveCampaign
let hasMoreDeals = true;

while (hasMoreDeals) {
const dealsUrl = new URL(`${BASE_URL}/api/3/deals`);
dealsUrl.searchParams.set("limit", limit.toString());
dealsUrl.searchParams.set("offset", offset.toString());

    console.log(`Fetching deals page with offset ${offset} and limit ${limit}`);
    const response = await fetchJSON(dealsUrl.toString());

    if (!response.deals || response.deals.length === 0) {
      hasMoreDeals = false;
    } else {
      allDeals = [...allDeals, ...response.deals];
      offset += limit;

      // Check if we received fewer deals than the limit, which means we've reached the end
      if (response.deals.length < limit) {
        hasMoreDeals = false;
      }

      // For testing, limit to 200 deals to speed things up
      if (allDeals.length >= 200) {
        console.log("Limiting to 200 deals for testing");
        hasMoreDeals = false;
      }
    }

}

console.log(`Total deals fetched: ${allDeals.length}`);
return allDeals;
}

export async function GET(request: NextRequest) {
try {
// Check if environment variables are set
if (!BASE_URL || !API_TOKEN) {
return NextResponse.json(
{ error: "Missing environment variables. Check .env file." },
{ status: 500 }
);
}

    // Get period from query params (default to 30 days)
    const period = Number(request.nextUrl.searchParams.get("period")) || 30;
    const fieldId = request.nextUrl.searchParams.get("fieldId") || "5";

    // Calculate date range based on period - FIXED DATE CALCULATION
    const now = new Date();
    const endDate = new Date(now);
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - period);

    // Format dates to YYYY-MM-DD
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(endDate);

    console.log(`Current date: ${formatDate(now)}`);
    console.log(`Searching for deals with date field between ${startDateStr} and ${endDateStr}`);

    // Fetch all deals with pagination (limited to 200 for testing)
    const allDeals = await fetchAllDeals();

    if (allDeals.length === 0) {
      console.log("No deals found in API");
      return NextResponse.json({ deals: [], message: "No deals found in API" });
    }

    console.log(`Found ${allDeals.length} deals in API`);

    // Array to store filtered deals
    const filteredDeals = [];
    const debugInfo = {
      totalDeals: allDeals.length,
      dealsWithoutFields: 0,
      dealsWithoutDateValue: 0,
      dealsOutsidePeriod: 0,
      dateFormat: {
        currentDate: formatDate(now),
        startDate: startDateStr,
        endDate: endDateStr
      },
      sampleDates: [],
      sampleDeals: [],
      firstDealStructure: allDeals.length > 0 ? JSON.stringify(allDeals[0]) : "No deals"
    };

    // Get a sample of deals for debugging
    if (allDeals.length > 0) {
      const sampleSize = Math.min(5, allDeals.length);
      for (let i = 0; i < sampleSize; i++) {
        // Safely access deal properties
        const dealData = allDeals[i];
        if (dealData && typeof dealData === 'object') {
          debugInfo.sampleDeals.push({
            raw: JSON.stringify(dealData).substring(0, 200) + "..." // First 200 chars
          });
        }
      }
    }

    // For each deal, check the custom date field
    for (const dealData of allDeals) {
      // Safely extract deal object - handle different possible structures
      let deal;
      if (dealData && typeof dealData === 'object') {
        if ('deal' in dealData && dealData.deal) {
          deal = dealData.deal;
        } else {
          deal = dealData; // Maybe the deal object is directly in the array
        }
      }

      // Skip if we couldn't find a valid deal object or it has no ID
      if (!deal || !deal.id) {
        continue;
      }

      try {
        // Fetch custom fields for this deal
        const customFieldUrl = new URL(`${BASE_URL}/api/3/dealCustomFieldData`);
        customFieldUrl.searchParams.set("filters[dealId]", deal.id.toString());

        const customFieldResponse = await fetchJSON(customFieldUrl.toString());

        // Check if we have custom field data
        if (!customFieldResponse.dealCustomFieldData || customFieldResponse.dealCustomFieldData.length === 0) {
          debugInfo.dealsWithoutFields++;
          continue;
        }

        // Find the date field
        const dateField = customFieldResponse.dealCustomFieldData.find(
          (field: any) => field.dealCustomFieldMetumId === parseInt(fieldId)
        );

        if (dateField && dateField.fieldValue) {
          const dateValue = dateField.fieldValue;

          // Add to sample dates for debugging (limit to 5)
          if (debugInfo.sampleDates.length < 5) {
            debugInfo.sampleDates.push({
              dealId: deal.id,
              title: deal.title || "No title",
              dateValue: dateValue,
              inRange: dateValue >= startDateStr && dateValue <= endDateStr
            });
          }

          // Check if date is within the period
          if (dateValue >= startDateStr && dateValue <= endDateStr) {
            console.log(`Deal ${deal.id} is within the period: ${dateValue}`);
            filteredDeals.push({
              deal: {
                id: deal.id,
                title: deal.title || "No title",
                value: deal.value || "0",
                currency: deal.currency || "BRL",
                cdate: deal.cdate || "",
                customField: {
                  id: fieldId,
                  value: dateValue
                }
              }
            });
          } else {
            debugInfo.dealsOutsidePeriod++;
          }
        } else {
          debugInfo.dealsWithoutDateValue++;
        }
      } catch (error) {
        console.error(`Error processing deal ${deal.id}:`, error);
        continue;
      }
    }

    console.log(`Filtered ${filteredDeals.length} deals within the period`);

    // Return array of filtered deals with debug info
    return NextResponse.json({
      deals: filteredDeals,
      debug: debugInfo
    });

} catch (error) {
console.error("API route error:", error);
return NextResponse.json(
{ error: error instanceof Error ? error.message : "Unknown error" },
{ status: 500 }
);
}
}

// Set a longer timeout for this API route since it may need to process many deals
export const config = {
maxDuration: 60, // 60 seconds
};
