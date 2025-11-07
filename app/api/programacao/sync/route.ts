import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Environment variables for ActiveCampaign
const BASE_URL = process.env.NEXT_PUBLIC_AC_BASE_URL;
const API_TOKEN = process.env.AC_API_TOKEN;

const headers = {
  "Api-Token": API_TOKEN || "",
  "Content-Type": "application/json",
};

// Rate limiting configuration for ActiveCampaign API
const RATE_LIMIT = {
  REQUESTS_PER_SECOND: 5,
  BATCH_SIZE: 10, // Process 10 requests in parallel
  MIN_BATCH_INTERVAL: 700, // 700ms between batches
  SAFETY_BUFFER: 50, // 50ms safety buffer
};

// Create Supabase client with service role key for sync operations
function createSupabaseServiceClient() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new Error("Missing Supabase environment variables");
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

async function fetchJSON(url: string, timeout = 30000) {
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

// Parallel fetch with rate limiting
async function fetchJSONParallel(urls: string[], maxRetries = 3) {
  const results: any[] = [];
  const errors: any[] = [];

  // Process URLs in batches to respect rate limits
  for (let i = 0; i < urls.length; i += RATE_LIMIT.BATCH_SIZE) {
    const batchStartTime = Date.now();
    const batch = urls.slice(i, i + RATE_LIMIT.BATCH_SIZE);
    console.log(
      `🔄 Processing batch ${
        Math.floor(i / RATE_LIMIT.BATCH_SIZE) + 1
      }/${Math.ceil(urls.length / RATE_LIMIT.BATCH_SIZE)}: ${
        batch.length
      } requests`
    );

    // Execute batch in parallel
    const batchPromises = batch.map(async (url, index) => {
      let lastError;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(
            `📡 Batch request ${index + 1}/${
              batch.length
            }, attempt ${attempt}/${maxRetries}`
          );
          const result = await fetchJSON(url);
          return { url, result, success: true };
        } catch (error) {
          lastError = error;
          console.error(
            `❌ Batch request ${index + 1} attempt ${attempt} failed:`,
            error
          );

          if (attempt < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 3000);
            console.log(`⏳ Waiting ${delay}ms before retry...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }

      return { url, error: lastError, success: false };
    });

    // Wait for all requests in the batch to complete
    const batchResults = await Promise.allSettled(batchPromises);

    batchResults.forEach((result) => {
      if (result.status === "fulfilled") {
        if (result.value.success) {
          results.push(result.value.result);
        } else {
          errors.push(result.value.error);
        }
      } else {
        errors.push(result.reason);
      }
    });

    // Adaptive delay to respect rate limits (except for the last batch)
    if (i + RATE_LIMIT.BATCH_SIZE < urls.length) {
      const batchDuration = Date.now() - batchStartTime;
      const requiredDelay = Math.max(
        0,
        RATE_LIMIT.MIN_BATCH_INTERVAL - batchDuration + RATE_LIMIT.SAFETY_BUFFER
      );

      if (requiredDelay > 0) {
        console.log(
          `⏳ Adaptive delay: batch took ${batchDuration}ms, waiting ${requiredDelay}ms more...`
        );
        await new Promise((resolve) => setTimeout(resolve, requiredDelay));
      } else {
        console.log(
          `⚡ No delay needed: batch took ${batchDuration}ms (>= ${RATE_LIMIT.MIN_BATCH_INTERVAL}ms)`
        );
      }
    }
  }

  console.log(
    `✅ Parallel fetch completed: ${results.length} successful, ${errors.length} failed`
  );
  return { results, errors };
}

// The custom field IDs we want to extract for programacao
const TARGET_CUSTOM_FIELD_IDS = [6, 7, 8, 9, 54]; // estado, quantidade_pares, vendedor, designer, data_embarque

// POST endpoint to sync deals from ActiveCampaign to programacao_cache
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Validate environment variables
    if (!BASE_URL || !API_TOKEN) {
      return NextResponse.json(
        { error: "ActiveCampaign credentials not configured" },
        { status: 500 }
      );
    }

    console.log("🔄 Starting programacao sync from ActiveCampaign...");

    // 1. Fetch all won deals from ActiveCampaign
    console.log("📦 Fetching won deals from ActiveCampaign...");
    let allDeals: any[] = [];
    let offset = 0;
    const limit = 100;
    let hasMoreDeals = true;

    while (hasMoreDeals) {
      const dealsUrl = new URL(`${BASE_URL}/api/3/deals`);
      dealsUrl.searchParams.set("limit", limit.toString());
      dealsUrl.searchParams.set("offset", offset.toString());
      dealsUrl.searchParams.set("filters[status]", "1"); // Only won deals

      const response = await fetchJSON(dealsUrl.toString());
      const deals = response.deals || [];

      allDeals = [...allDeals, ...deals];

      if (deals.length < limit) {
        hasMoreDeals = false;
      } else {
        offset += limit;
      }
    }

    console.log(`✅ Fetched ${allDeals.length} won deals from ActiveCampaign`);

    // 2. Fetch custom field data ONLY for won deals using filters[dealId]
    console.log(
      "🔍 Fetching custom field data for won deals only (optimized)..."
    );

    // Create URLs to fetch custom fields for each won deal
    const customFieldUrls: string[] = allDeals.map((deal) => {
      const customFieldUrl = new URL(`${BASE_URL}/api/3/dealCustomFieldData`);
      customFieldUrl.searchParams.set("filters[dealId]", deal.id.toString());
      return customFieldUrl.toString();
    });

    console.log(
      `📊 Fetching custom fields for ${customFieldUrls.length} won deals`
    );

    // Fetch all custom field data in parallel
    const { results: customFieldResults, errors: customFieldErrors } =
      await fetchJSONParallel(customFieldUrls);

    let allCustomFieldData: any[] = [];
    customFieldResults.forEach((response) => {
      if (response.dealCustomFieldData) {
        allCustomFieldData = [
          ...allCustomFieldData,
          ...response.dealCustomFieldData,
        ];
      }
    });

    console.log(
      `📊 Fetched ${allCustomFieldData.length} custom field entries from ${allDeals.length} won deals (${customFieldErrors.length} errors)`
    );

    // Filter to only target custom fields
    const targetCustomFieldData = allCustomFieldData.filter((item) =>
      TARGET_CUSTOM_FIELD_IDS.includes(parseInt(item.customFieldId))
    );

    console.log(
      `📊 Filtered to ${targetCustomFieldData.length} target custom field entries`
    );

    // Create lookup map for custom fields
    const dealCustomFieldsMap = new Map<string, Map<number, string>>();

    targetCustomFieldData.forEach((item) => {
      const dealId = item.dealId.toString();
      const fieldId = parseInt(item.customFieldId);
      const fieldValue = item.fieldValue || "";

      if (!dealCustomFieldsMap.has(dealId)) {
        dealCustomFieldsMap.set(dealId, new Map());
      }
      dealCustomFieldsMap.get(dealId)!.set(fieldId, fieldValue);
    });

    console.log(
      `📊 Created lookup map for ${dealCustomFieldsMap.size} deals with custom fields`
    );

    // 3. Transform deals for programacao_cache (without closingDate and stageTitle)
    const transformedDeals = allDeals.map((deal) => {
      const dealCustomFields =
        dealCustomFieldsMap.get(deal.id.toString()) || new Map();

      return {
        deal_id: deal.id,
        title: deal.title,
        value: parseInt(deal.value) || 0,
        currency: deal.currency || "BRL",
        stage_id: deal.stage,
        data_embarque: dealCustomFields.get(54) || null, // Custom field 54 - Data de Embarque
        created_date: deal.cdate ? new Date(deal.cdate).toISOString() : null,
        estado: dealCustomFields.get(6) || null,
        quantidade_pares: dealCustomFields.get(7) || null,
        vendedor: dealCustomFields.get(8) || null,
        designer: dealCustomFields.get(9) || null,
        contact_id: deal.contact,
        organization_id: deal.organization,
        api_updated_at: deal.mdate ? new Date(deal.mdate).toISOString() : null,
        last_synced_at: new Date().toISOString(),
        sync_status: "synced",
      };
    });

    // 3.5. Remove duplicates by deal_id (keep the last occurrence)
    const dealsMap = new Map();
    transformedDeals.forEach((deal) => {
      dealsMap.set(deal.deal_id, deal);
    });
    const uniqueDeals = Array.from(dealsMap.values());

    console.log(
      `📊 Total deals: ${transformedDeals.length}, Unique deals: ${
        uniqueDeals.length
      }, Duplicates removed: ${transformedDeals.length - uniqueDeals.length}`
    );

    // 4. Upsert to Supabase programacao_cache
    console.log("💾 Upserting deals to programacao_cache...");
    const supabase = createSupabaseServiceClient();

    const UPSERT_BATCH_SIZE = 500;
    let totalUpserted = 0;

    for (let i = 0; i < uniqueDeals.length; i += UPSERT_BATCH_SIZE) {
      const batch = uniqueDeals.slice(i, i + UPSERT_BATCH_SIZE);

      const { error: upsertError } = await supabase
        .from("programacao_cache")
        .upsert(batch, {
          onConflict: "deal_id",
          ignoreDuplicates: false,
        });

      if (upsertError) {
        console.error("Error upserting batch:", upsertError);
        throw upsertError;
      }

      totalUpserted += batch.length;
      console.log(`✅ Upserted ${totalUpserted}/${uniqueDeals.length} deals`);
    }

    const syncDuration = (Date.now() - startTime) / 1000;

    console.log(`✅ Sync completed in ${syncDuration.toFixed(2)}s`);

    return NextResponse.json({
      success: true,
      message: "Programacao sync completed successfully (optimized)",
      summary: {
        totalWonDeals: allDeals.length,
        totalCustomFieldEntries: allCustomFieldData.length,
        targetCustomFieldEntries: targetCustomFieldData.length,
        dealsWithCustomFields: dealCustomFieldsMap.size,
        uniqueDeals: uniqueDeals.length,
        duplicatesRemoved: transformedDeals.length - uniqueDeals.length,
        dealsUpserted: totalUpserted,
        customFieldErrors: customFieldErrors.length,
        syncDurationSeconds: syncDuration,
        optimization: {
          note: "Fetching custom fields only for won deals using filters[dealId]",
          dealsQueried: allDeals.length,
          avgCustomFieldsPerDeal:
            allDeals.length > 0
              ? (allCustomFieldData.length / allDeals.length).toFixed(2)
              : 0,
        },
        rateLimit: RATE_LIMIT,
        performance: {
          dealsPerSecond: (allDeals.length / syncDuration).toFixed(2),
          customFieldsPerSecond: (
            allCustomFieldData.length / syncDuration
          ).toFixed(2),
          upsertsPerSecond: (totalUpserted / syncDuration).toFixed(2),
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Error in programacao sync:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
        stack: error instanceof Error ? error.stack : null,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
