import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Type for Meta Ad from Facebook API
interface MetaAd {
  id: string;
  name: string;
  status: string;
}

// Helper function to normalize ad names for matching
function normalizeAdName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD") // Normalize unicode characters
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/\s+/g, "") // Remove all spaces
    .replace(/[^a-z0-9]/g, "") // Remove special characters
    .trim();
}

// Helper function to check if utm_medium matches ad name
function matchesAdName(utmMedium: string | null, adName: string): boolean {
  if (!utmMedium) return false;

  const normalizedUtm = normalizeAdName(utmMedium);
  const normalizedAd = normalizeAdName(adName);

  // Log for debugging
  console.log(
    `🔍 Matching: UTM="${utmMedium}" (normalized: "${normalizedUtm}") vs Ad="${adName}" (normalized: "${normalizedAd}")`
  );

  // Check if they match or if one contains the other
  const matches =
    normalizedUtm === normalizedAd ||
    normalizedUtm.includes(normalizedAd) ||
    normalizedAd.includes(normalizedUtm);

  if (matches) {
    console.log(`✅ MATCH FOUND: "${utmMedium}" matches "${adName}"`);
  }

  return matches;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "startDate and endDate are required" },
        { status: 400 }
      );
    }

    console.log("📊 Fetching ads performance data...", { startDate, endDate });

    // 1. Fetch Meta ads data with insights
    const accessToken = process.env.META_ACCESS_TOKEN;
    const businessId = process.env.META_BUSINESS_ID;

    if (!accessToken || !businessId) {
      return NextResponse.json(
        { error: "Meta credentials not configured" },
        { status: 500 }
      );
    }

    // Get ad account
    const businessUrl = `https://graph.facebook.com/v23.0/${businessId}/owned_ad_accounts`;
    const businessParams = new URLSearchParams({
      access_token: accessToken,
      fields: "id",
    });

    const businessResponse = await fetch(`${businessUrl}?${businessParams}`);
    const businessData = await businessResponse.json();

    if (!businessData.data || businessData.data.length === 0) {
      return NextResponse.json(
        { error: "No ad accounts found" },
        { status: 404 }
      );
    }

    const adAccountId = businessData.data[0].id;

    // Get ALL ads (active and inactive) for matching purposes
    const adsUrl = `https://graph.facebook.com/v23.0/${adAccountId}/ads`;
    const adsParams = new URLSearchParams({
      access_token: accessToken,
      fields: "id,name,status",
      limit: "500",
    });

    const adsResponse = await fetch(`${adsUrl}?${adsParams}`);
    const adsData = await adsResponse.json();

    console.log(
      `📊 Found ${adsData.data?.length || 0} total ads (active and inactive)`
    );

    // Store all ads for matching (including inactive ones)
    const allAds = (adsData.data || []).map((ad: MetaAd) => ({
      id: ad.id,
      name: ad.name,
      status: ad.status,
    }));

    // Fetch insights for each ad in parallel
    const adsWithInsights = await Promise.all(
      (adsData.data || []).map(async (ad: MetaAd) => {
        const insightsUrl = `https://graph.facebook.com/v23.0/${ad.id}/insights`;
        const insightsParams = new URLSearchParams({
          access_token: accessToken,
          fields: "spend,impressions,clicks,actions",
          time_range: JSON.stringify({
            since: startDate,
            until: endDate,
          }),
          level: "ad",
        });

        try {
          const insightsResponse = await fetch(
            `${insightsUrl}?${insightsParams}`
          );
          const insightsData = await insightsResponse.json();

          const insights = insightsData.data?.[0] || {};

          return {
            id: ad.id,
            name: ad.name,
            status: ad.status,
            spend: parseFloat(insights.spend || "0"),
            impressions: parseInt(insights.impressions || "0"),
            clicks: parseInt(insights.clicks || "0"),
          };
        } catch (error) {
          console.error(`Error fetching insights for ad ${ad.id}:`, error);
          return {
            id: ad.id,
            name: ad.name,
            status: ad.status,
            spend: 0,
            impressions: 0,
            clicks: 0,
          };
        }
      })
    );

    // 2. Fetch sales data from deals_cache
    const { data: deals, error: dealsError } = await supabase
      .from("deals_cache")
      .select(
        `
        deal_id,
        title,
        value,
        "quantidade-de-pares",
        "utm-source",
        "utm-medium",
        contact_id,
        closing_date
      `
      )
      .eq("sync_status", "synced")
      .not("closing_date", "is", null)
      .gte("closing_date", startDate)
      .lte("closing_date", endDate);

    if (dealsError) {
      console.error("Error fetching deals:", dealsError);
      return NextResponse.json(
        { error: "Failed to fetch sales data" },
        { status: 500 }
      );
    }

    const activeAdsCount = allAds.filter(
      (ad: MetaAd) => ad.status === "ACTIVE"
    ).length;
    const inactiveAdsCount = allAds.length - activeAdsCount;

    console.log(
      `📈 Found ${
        adsWithInsights.length
      } ads with insights, ${activeAdsCount} active ads, ${inactiveAdsCount} inactive ads, and ${
        deals?.length || 0
      } deals`
    );

    // 3. Match ads with sales
    const adsPerformance = adsWithInsights.map((ad) => {
      // Find deals that match this ad
      const matchingDeals = (deals || []).filter((deal) =>
        matchesAdName(deal["utm-medium"], ad.name)
      );

      // Divide by 100 to convert from cents to real currency value
      const revenue = matchingDeals.reduce(
        (sum, deal) => sum + (deal.value || 0) / 100,
        0
      );
      const pairsSold = matchingDeals.reduce((sum, deal) => {
        const pairs = deal["quantidade-de-pares"];
        return sum + (pairs ? parseInt(pairs) : 0);
      }, 0);

      // Count unique customers (by contact_id)
      const uniqueCustomers = new Set(
        matchingDeals.filter((d) => d.contact_id).map((d) => d.contact_id)
      ).size;

      const roi = ad.spend > 0 ? ((revenue - ad.spend) / ad.spend) * 100 : 0;

      return {
        adId: ad.id,
        adName: ad.name,
        status: ad.status,
        spend: ad.spend,
        impressions: ad.impressions,
        clicks: ad.clicks,
        revenue,
        pairsSold,
        customersConverted: uniqueCustomers,
        roi,
        profit: revenue - ad.spend,
      };
    });

    // Filter out ads with no spend
    const activeAdsPerformance = adsPerformance.filter((ad) => ad.spend > 0);

    // Sort by spend (descending)
    activeAdsPerformance.sort((a, b) => b.spend - a.spend);

    // 4. Get non-Meta UTM sources
    // Use ALL ads (including inactive) to properly identify Meta deals
    let dealsMatchedToInactiveAds = 0;
    const nonMetaDeals = (deals || []).filter((deal) => {
      const utmSource = deal["utm-source"];
      const utmMedium = deal["utm-medium"];

      // Skip if no UTM data
      if (!utmSource || !utmMedium) return false;

      // Check if this deal matches ANY Meta ad (active or inactive)
      const matchedAd = allAds.find((ad: MetaAd) =>
        matchesAdName(utmMedium, ad.name)
      );

      if (matchedAd) {
        // Check if it's an inactive ad
        const isInactive = matchedAd.status !== "ACTIVE";
        if (isInactive) {
          dealsMatchedToInactiveAds++;
          console.log(
            `🔄 Deal matched to INACTIVE Meta ad: utm-medium="${utmMedium}" → ad="${matchedAd.name}" (status: ${matchedAd.status})`
          );
        }
      }

      return !matchedAd;
    });

    console.log(
      `📊 Deals matched to inactive Meta ads: ${dealsMatchedToInactiveAds}`
    );
    console.log(`📊 True non-Meta deals: ${nonMetaDeals.length}`);

    // Group non-Meta deals by utm_source and utm_medium
    const nonMetaGroups: Record<
      string,
      {
        utmSource: string;
        utmMedium: string;
        revenue: number;
        pairsSold: number;
        customersConverted: number;
        dealsCount: number;
      }
    > = {};

    nonMetaDeals.forEach((deal) => {
      const key = `${deal["utm-source"]}|${deal["utm-medium"]}`;

      if (!nonMetaGroups[key]) {
        nonMetaGroups[key] = {
          utmSource: deal["utm-source"]!,
          utmMedium: deal["utm-medium"]!,
          revenue: 0,
          pairsSold: 0,
          customersConverted: 0,
          dealsCount: 0,
        };
      }

      // Divide by 100 to convert from cents to real currency value
      nonMetaGroups[key].revenue += (deal.value || 0) / 100;
      nonMetaGroups[key].pairsSold += deal["quantidade-de-pares"]
        ? parseInt(deal["quantidade-de-pares"])
        : 0;
      nonMetaGroups[key].dealsCount += 1;
    });

    // Count unique customers for each group
    Object.keys(nonMetaGroups).forEach((key) => {
      const [utmSource, utmMedium] = key.split("|");
      const groupDeals = nonMetaDeals.filter(
        (d) => d["utm-source"] === utmSource && d["utm-medium"] === utmMedium
      );

      nonMetaGroups[key].customersConverted = new Set(
        groupDeals.filter((d) => d.contact_id).map((d) => d.contact_id)
      ).size;
    });

    const nonMetaPerformance = Object.values(nonMetaGroups).sort(
      (a, b) => b.revenue - a.revenue
    );

    return NextResponse.json({
      adsPerformance: activeAdsPerformance,
      nonMetaPerformance,
      summary: {
        totalAdsSpend: activeAdsPerformance.reduce(
          (sum, ad) => sum + ad.spend,
          0
        ),
        totalRevenue: activeAdsPerformance.reduce(
          (sum, ad) => sum + ad.revenue,
          0
        ),
        totalPairsSold: activeAdsPerformance.reduce(
          (sum, ad) => sum + ad.pairsSold,
          0
        ),
        totalCustomers: activeAdsPerformance.reduce(
          (sum, ad) => sum + ad.customersConverted,
          0
        ),
        nonMetaRevenue: nonMetaPerformance.reduce(
          (sum, group) => sum + group.revenue,
          0
        ),
        nonMetaPairsSold: nonMetaPerformance.reduce(
          (sum, group) => sum + group.pairsSold,
          0
        ),
      },
    });
  } catch (error) {
    console.error("Error in ads performance API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
