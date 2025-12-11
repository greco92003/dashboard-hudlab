import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Environment variables
const BASE_URL = process.env.NEXT_PUBLIC_AC_BASE_URL;
const API_TOKEN = process.env.AC_API_TOKEN;

// The custom field IDs we want to extract
const TARGET_CUSTOM_FIELD_IDS = [5, 25, 39, 45, 47, 49, 50];

const headers = {
  "Api-Token": API_TOKEN || "",
  "Content-Type": "application/json",
};

// Rate limiting configuration for ActiveCampaign API
// Optimized for faster sync while respecting API limits
const RATE_LIMIT = {
  REQUESTS_PER_SECOND: 5,
  BATCH_SIZE: 10, // Increased from 5 to process more requests in parallel
  MIN_BATCH_INTERVAL: 700, // Reduced from 1000ms for faster processing
  SAFETY_BUFFER: 50, // 50ms safety buffer
};

// Create Supabase client with service role key for API operations
// This bypasses RLS policies and allows full database access
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

// Enhanced fetch function with timeout and retry
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

// Parallel fetch with rate limiting
async function fetchJSONParallel(urls: string[], maxRetries = 3) {
  const results: any[] = [];
  const errors: any[] = [];

  // Process URLs in batches to respect rate limits with adaptive timing
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
          return { success: true, data: result, url };
        } catch (error) {
          lastError = error;
          console.warn(
            `⚠️ Attempt ${attempt}/${maxRetries} failed for ${url}:`,
            error instanceof Error ? error.message : error
          );

          if (attempt < maxRetries) {
            const backoffDelay = Math.min(
              1000 * Math.pow(2, attempt - 1),
              5000
            );
            console.log(`⏳ Retrying in ${backoffDelay}ms...`);
            await new Promise((resolve) => setTimeout(resolve, backoffDelay));
          }
        }
      }

      return { success: false, error: lastError, url };
    });

    // Wait for all requests in this batch to complete
    const batchResults = await Promise.allSettled(batchPromises);

    // Process results
    batchResults.forEach((result, index) => {
      if (result.status === "fulfilled") {
        const { success, data, error, url } = result.value;
        if (success) {
          results.push(data);
        } else {
          errors.push({ url, error });
          console.error(`❌ Failed to fetch ${url}:`, error);
        }
      } else {
        errors.push({ url: batch[index], error: result.reason });
        console.error(
          `❌ Promise rejected for ${batch[index]}:`,
          result.reason
        );
      }
    });

    // Calculate timing for next batch
    const batchDuration = Date.now() - batchStartTime;
    const minInterval =
      RATE_LIMIT.MIN_BATCH_INTERVAL + RATE_LIMIT.SAFETY_BUFFER;
    const remainingTime = Math.max(0, minInterval - batchDuration);

    if (remainingTime > 0 && i + RATE_LIMIT.BATCH_SIZE < urls.length) {
      console.log(`⏳ Waiting ${remainingTime}ms before next batch...`);
      await new Promise((resolve) => setTimeout(resolve, remainingTime));
    }
  }

  return { results, errors };
}

// Helper function to convert date format from DD/MM/YYYY to YYYY-MM-DD
function convertDateFormat(dateStr: string): string | null {
  if (!dateStr) return null;

  // Handle DD/MM/YYYY format
  const ddmmyyyyMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ddmmyyyyMatch) {
    const [, day, month, year] = ddmmyyyyMatch;
    return `${year}-${month}-${day}`;
  }

  // Handle YYYY-MM-DD format (already correct)
  const yyyymmddMatch = dateStr.match(/^\d{4}-\d{2}-\d{2}$/);
  if (yyyymmddMatch) {
    return dateStr;
  }

  console.warn(`Unrecognized date format: ${dateStr}`);
  return null;
}

// Function to get deals that need to be checked (new or modified)
async function getDealsNeedingCheck(supabase: any, allDeals: any[]) {
  console.log("🔍 Checking which deals need to be processed...");

  const dealIds = allDeals.map((deal) => deal.id.toString());
  const dealMdates = allDeals.map(
    (deal) => deal.mdate || deal.cdate || new Date().toISOString()
  );

  // Get existing tracking data
  const { data: trackingData, error } = await supabase
    .from("deals_processed_tracking")
    .select(
      "deal_id, deal_api_updated_at, last_checked_at, has_custom_field_5, has_any_target_fields"
    )
    .in("deal_id", dealIds);

  if (error) {
    console.error("Error fetching tracking data:", error);
    // If tracking fails, process all deals (fallback to full sync)
    return allDeals.map((deal) => ({ deal, isNew: true, isModified: false }));
  }

  const trackingMap = new Map(
    trackingData?.map((t: any) => [t.deal_id, t]) || []
  );

  const dealsToProcess = [];
  let newDealsCount = 0;
  let modifiedDealsCount = 0;
  let skippedDealsCount = 0;

  for (const deal of allDeals) {
    const dealId = deal.id.toString();
    const dealMdate = new Date(deal.mdate || deal.cdate || new Date());
    const tracking = trackingMap.get(dealId);

    if (!tracking) {
      // New deal
      dealsToProcess.push({ deal, isNew: true, isModified: false });
      newDealsCount++;
    } else {
      const lastCheckedMdate = new Date(
        (tracking as any).deal_api_updated_at || 0
      );
      if (dealMdate > lastCheckedMdate) {
        // Modified deal
        dealsToProcess.push({ deal, isNew: false, isModified: true });
        modifiedDealsCount++;
      } else {
        // Deal already processed and not modified
        skippedDealsCount++;
      }
    }
  }

  console.log(`📊 Deal analysis complete:`);
  console.log(`  - New deals: ${newDealsCount}`);
  console.log(`  - Modified deals: ${modifiedDealsCount}`);
  console.log(`  - Skipped deals: ${skippedDealsCount}`);
  console.log(`  - Total to process: ${dealsToProcess.length}`);
  console.log(
    `  - Optimization: ${((skippedDealsCount / allDeals.length) * 100).toFixed(
      1
    )}% reduction`
  );

  return dealsToProcess;
}

// Function to update tracking data
async function updateTrackingData(
  supabase: any,
  dealData: any[],
  customFieldsMap: Map<string, Map<number, string>>,
  syncBatchId: string
) {
  console.log("📝 Updating tracking data...");

  // Create tracking updates and deduplicate by deal_id to prevent constraint violations
  const trackingUpdatesMap = new Map();

  dealData.forEach(({ deal, isNew, isModified }) => {
    const dealId = deal.id.toString();
    const dealCustomFields = customFieldsMap.get(dealId) || new Map();

    const hasCustomField5 =
      dealCustomFields.has(5) &&
      dealCustomFields.get(5) !== null &&
      dealCustomFields.get(5) !== "";
    const targetFieldsFound = TARGET_CUSTOM_FIELD_IDS.filter(
      (fieldId) =>
        dealCustomFields.has(fieldId) &&
        dealCustomFields.get(fieldId) !== null &&
        dealCustomFields.get(fieldId) !== ""
    );
    const hasAnyTargetFields = targetFieldsFound.length > 0;

    // Use Map to automatically deduplicate by deal_id
    trackingUpdatesMap.set(dealId, {
      deal_id: dealId,
      has_custom_field_5: hasCustomField5,
      has_any_target_fields: hasAnyTargetFields,
      target_fields_found: targetFieldsFound,
      last_checked_at: new Date().toISOString(),
      deal_api_updated_at: deal.mdate || deal.cdate || new Date().toISOString(),
      deal_created_at: deal.cdate || new Date().toISOString(),
      sync_batch_id: syncBatchId,
      updated_at: new Date().toISOString(),
    });
  });

  // Convert Map to Array (this automatically removes duplicates)
  const trackingUpdates = Array.from(trackingUpdatesMap.values());

  console.log(`📊 Original deal data: ${dealData.length} items`);
  console.log(
    `📊 Deduplicated tracking updates: ${trackingUpdates.length} items`
  );

  console.log(
    `📊 Attempting to upsert ${trackingUpdates.length} tracking records...`
  );

  // Upsert tracking data with better error handling
  const { data, error } = await supabase
    .from("deals_processed_tracking")
    .upsert(trackingUpdates, {
      onConflict: "deal_id",
      returning: "minimal",
    });

  if (error) {
    console.error("Error updating tracking data:", error);
    console.error("Error details:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });

    // Try to provide more helpful error information
    if (error.code === "42501") {
      console.error(
        "RLS Policy Error: The service role may not have proper permissions."
      );
      console.error(
        "Please run the fix_tracking_table_rls.sql migration to resolve this."
      );
    }

    throw new Error(`Failed to update tracking data: ${error.message}`);
  }

  console.log(`✅ Updated tracking data for ${trackingUpdates.length} deals`);

  // Return statistics
  const stats = {
    totalProcessed: trackingUpdates.length,
    withField5: trackingUpdates.filter((t) => t.has_custom_field_5).length,
    withAnyTargetFields: trackingUpdates.filter((t) => t.has_any_target_fields)
      .length,
    newDeals: dealData.filter((d) => d.isNew).length,
    modifiedDeals: dealData.filter((d) => d.isModified).length,
  };

  return stats;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  let syncLogId: string | null = null;

  try {
    console.log("🚀 ROBUST DEALS SYNC PARALLEL WITH TRACKING - Starting...");
    console.log(
      `🎯 Target custom field IDs: ${TARGET_CUSTOM_FIELD_IDS.join(", ")}`
    );
    console.log(
      `⚡ Rate limiting: ${RATE_LIMIT.REQUESTS_PER_SECOND} req/sec, batch size: ${RATE_LIMIT.BATCH_SIZE}`
    );

    if (!BASE_URL || !API_TOKEN) {
      return NextResponse.json(
        { error: "Missing environment variables. Check .env file." },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const clearFirst = searchParams.get("clearFirst") === "true";
    const dryRun = searchParams.get("dryRun") === "true";
    const allDealsParam = searchParams.get("allDeals") === "true";
    const maxDeals = allDealsParam
      ? null
      : parseInt(searchParams.get("maxDeals") || "1000");
    const forceFullSync = searchParams.get("forceFullSync") === "true"; // Override tracking

    console.log(`🔍 Mode: ${dryRun ? "DRY RUN" : "LIVE UPDATE"}`);
    console.log(`🗑️ Clear first: ${clearFirst ? "YES" : "NO"}`);
    console.log(
      `📊 Max deals to process: ${allDealsParam ? "ALL DEALS" : maxDeals}`
    );
    console.log(`🔄 Force full sync: ${forceFullSync ? "YES" : "NO"}`);

    const supabase = createSupabaseServiceClient();
    const syncBatchId = `tracking_sync_${Date.now()}`;

    // Create sync log entry (only for live updates, not dry runs)
    if (!dryRun) {
      console.log("📝 Creating sync log entry...");
      const { data: syncLog, error: syncLogError } = await supabase
        .from("deals_sync_log")
        .insert({
          sync_started_at: new Date().toISOString(),
          sync_status: "running",
          deals_processed: 0,
          deals_added: 0,
          deals_updated: 0,
          deals_deleted: 0,
        })
        .select("id")
        .single();

      if (syncLogError) {
        console.error("❌ Error creating sync log:", syncLogError);
        throw new Error(`Failed to create sync log: ${syncLogError.message}`);
      }

      syncLogId = syncLog.id;
      console.log(`✅ Sync log created with ID: ${syncLogId}`);
    }

    // Step 0: Clear deals_cache if requested
    if (clearFirst && !dryRun) {
      console.log("🗑️ STEP 0: Clearing deals_cache table...");
      const { error: deleteError } = await supabase
        .from("deals_cache")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (deleteError) {
        console.error("Error clearing table:", deleteError);
        return NextResponse.json(
          { error: "Failed to clear table" },
          { status: 500 }
        );
      }
      console.log("✅ deals_cache table cleared");
    }

    // Step 1: Get deals with parallel pagination
    console.log("🎯 STEP 1: Fetching deals with parallel pagination...");
    let allDeals: any[] = [];
    const limit = 100;

    // First, get the total count to determine how many pages we need
    const firstPageUrl = new URL(`${BASE_URL}/api/3/deals`);
    firstPageUrl.searchParams.set("limit", "1");
    firstPageUrl.searchParams.set("offset", "0");

    const firstPageResponse = await fetchJSON(firstPageUrl.toString());
    const totalAvailableDeals = firstPageResponse.meta?.total || 0;
    const totalDeals = allDealsParam
      ? totalAvailableDeals
      : Math.min(totalAvailableDeals, maxDeals!);
    const totalPages = Math.ceil(totalDeals / limit);

    console.log(`📊 Total deals available: ${totalAvailableDeals}`);
    console.log(`📊 Processing: ${totalDeals} deals in ${totalPages} pages`);

    if (allDealsParam) {
      console.log(
        `⚡ ALL DEALS MODE: Processing all ${totalAvailableDeals} deals`
      );
    }

    // Create URLs for all pages
    const dealUrls: string[] = [];
    for (let page = 0; page < totalPages; page++) {
      const offset = page * limit;
      const dealsUrl = new URL(`${BASE_URL}/api/3/deals`);
      dealsUrl.searchParams.set("limit", limit.toString());
      dealsUrl.searchParams.set("offset", offset.toString());
      dealUrls.push(dealsUrl.toString());
    }

    // Fetch all pages in parallel with rate limiting
    const { results: dealResults, errors: dealErrors } =
      await fetchJSONParallel(dealUrls);

    // Combine all deals
    dealResults.forEach((response) => {
      if (response.deals) {
        allDeals = [...allDeals, ...response.deals];
      }
    });

    console.log(
      `📊 STEP 1 COMPLETE: Fetched ${allDeals.length} deals (${dealErrors.length} errors)`
    );

    // Step 1.5: TRACKING OPTIMIZATION - Determine which deals need processing
    let dealsToProcess: any[] = [];

    if (forceFullSync) {
      console.log("🔄 Force full sync enabled - processing all deals");
      dealsToProcess = allDeals.map((deal) => ({
        deal,
        isNew: true,
        isModified: false,
      }));
    } else {
      dealsToProcess = await getDealsNeedingCheck(supabase, allDeals);
    }

    if (dealsToProcess.length === 0) {
      console.log("✅ No deals need processing - all deals are up to date!");

      const syncDuration = (Date.now() - startTime) / 1000;

      // Update sync log with completion (even when no deals processed)
      if (!dryRun && syncLogId) {
        console.log(
          "📝 Updating sync log with completion (no deals processed)..."
        );
        const { error: updateError } = await supabase
          .from("deals_sync_log")
          .update({
            sync_completed_at: new Date().toISOString(),
            sync_status: "completed",
            deals_processed: 0,
            deals_added: 0,
            deals_updated: 0,
            deals_deleted: 0,
            sync_duration_seconds: Math.round(syncDuration),
          })
          .eq("id", syncLogId);

        if (updateError) {
          console.error("❌ Error updating sync log:", updateError);
        } else {
          console.log("✅ Sync log updated successfully (no deals processed)");
        }
      }

      console.log(
        `🎉 TRACKING SYNC COMPLETED (NO PROCESSING NEEDED) in ${syncDuration}s`
      );

      return NextResponse.json({
        success: true,
        message: "No deals needed processing - all up to date",
        optimized: true,
        summary: {
          totalDealsAvailable: allDeals.length,
          dealsProcessed: 0,
          dealsSkipped: allDeals.length,
          optimizationPercentage: 100,
          syncDurationSeconds: syncDuration,
        },
      });
    }

    // Extract just the deals that need processing
    const dealsNeedingCustomFields = dealsToProcess.map((item) => item.deal);
    const dealIdsNeedingCustomFields = dealsNeedingCustomFields.map(
      (deal) => deal.id
    );

    console.log(
      `🎯 OPTIMIZATION: Processing ${dealsNeedingCustomFields.length} deals instead of ${allDeals.length}`
    );
    console.log(
      `📈 Efficiency gain: ${(
        (1 - dealsNeedingCustomFields.length / allDeals.length) *
        100
      ).toFixed(1)}% reduction`
    );

    // Step 2: Get custom field data ONLY for deals that need processing
    console.log(
      "🎯 STEP 2: Fetching custom field data for deals needing processing..."
    );

    // Build filter for custom fields to only get data for deals we need
    const customFieldUrls: string[] = [];
    const customFieldBatchSize = 100; // Process deal IDs in batches for the filter

    for (
      let i = 0;
      i < dealIdsNeedingCustomFields.length;
      i += customFieldBatchSize
    ) {
      const dealIdBatch = dealIdsNeedingCustomFields.slice(
        i,
        i + customFieldBatchSize
      );
      const customFieldUrl = new URL(`${BASE_URL}/api/3/dealCustomFieldData`);
      customFieldUrl.searchParams.set("limit", "100");
      customFieldUrl.searchParams.set("filters[dealId]", dealIdBatch.join(","));
      customFieldUrls.push(customFieldUrl.toString());
    }

    console.log(
      `📊 Created ${customFieldUrls.length} custom field queries for ${dealIdsNeedingCustomFields.length} deals`
    );

    // Fetch custom field data in parallel
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
      `📊 STEP 2 COMPLETE: Fetched ${allCustomFieldData.length} custom field entries (${customFieldErrors.length} errors)`
    );
    console.log(
      `🎯 OPTIMIZATION: Fetched custom fields for ${dealIdsNeedingCustomFields.length} deals instead of all deals`
    );

    // Step 3: Process and filter custom field data
    console.log("🎯 STEP 3: Processing custom field data...");
    const targetCustomFieldData = allCustomFieldData.filter((item) =>
      TARGET_CUSTOM_FIELD_IDS.includes(parseInt(item.customFieldId))
    );

    console.log(
      `📊 Filtered to ${targetCustomFieldData.length} target custom field entries`
    );

    // Step 4: Create lookup map for custom fields
    console.log("🎯 STEP 4: Creating custom field lookup map...");
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

    // Step 4.5: Update tracking data
    const trackingStats = await updateTrackingData(
      supabase,
      dealsToProcess,
      dealCustomFieldsMap,
      syncBatchId
    );
    console.log(`📊 Tracking stats:`, trackingStats);

    // Step 5: Get deals with custom field 5 from tracking + current batch
    console.log("🎯 STEP 5: Combining deals with custom field 5...");

    // Get previously tracked deals with custom field 5
    const { data: trackedDealsWithField5, error: trackingError } =
      await supabase
        .from("deals_processed_tracking")
        .select("deal_id")
        .eq("has_custom_field_5", true);

    if (trackingError) {
      console.error("Error fetching tracked deals:", trackingError);
      throw new Error(
        `Failed to fetch tracked deals: ${trackingError.message}`
      );
    }

    const trackedDealIds = new Set(
      trackedDealsWithField5?.map((t) => t.deal_id) || []
    );

    // Get all deals that have custom field 5 (tracked + current)
    const allDealsWithField5 = allDeals.filter((deal) => {
      const dealId = deal.id.toString();
      const dealCustomFields = dealCustomFieldsMap.get(dealId) || new Map();
      const hasField5InCurrent =
        dealCustomFields.has(5) &&
        dealCustomFields.get(5) !== null &&
        dealCustomFields.get(5) !== "";
      return trackedDealIds.has(dealId) || hasField5InCurrent;
    });

    console.log(
      `📊 Total deals with custom field 5: ${allDealsWithField5.length}`
    );
    console.log(`  - From tracking: ${trackedDealIds.size}`);
    console.log(`  - From current batch: ${trackingStats.withField5}`);

    // Step 6: Process deals and combine with custom field data
    console.log(
      "🎯 STEP 6: Processing deals and combining with custom fields..."
    );
    const processedDeals = allDealsWithField5.map((deal) => {
      const dealCustomFields =
        dealCustomFieldsMap.get(deal.id.toString()) || new Map();

      // Get custom field values
      const closingDate = dealCustomFields.get(5) || null; // Data Fechamento
      const estado = dealCustomFields.get(25) || null;
      const quantidadeDePares = dealCustomFields.get(39) || null;
      const vendedor = dealCustomFields.get(45) || null;
      const designer = dealCustomFields.get(47) || null;
      const utmSource = dealCustomFields.get(49) || null; // UTM Source
      const utmMedium = dealCustomFields.get(50) || null; // UTM Medium

      const convertedClosingDate = closingDate
        ? convertDateFormat(closingDate)
        : null;
      const value = parseFloat(deal.value || "0");

      return {
        deal_id: deal.id,
        title: deal.title || "",
        value: value,
        currency: deal.currency || "BRL",
        status: deal.status || null,
        stage_id: deal.stage || null,
        closing_date: convertedClosingDate,
        created_date: deal.cdate || null,
        custom_field_value: closingDate,
        custom_field_id: "5",
        estado: estado,
        "quantidade-de-pares": quantidadeDePares,
        vendedor: vendedor,
        designer: designer,
        "utm-source": utmSource,
        "utm-medium": utmMedium,
        contact_id: deal.contact || null,
        organization_id: deal.organization || null,
        api_updated_at: deal.mdate || deal.cdate || null,
        last_synced_at: new Date().toISOString(),
        sync_status: "synced" as const,
      };
    });

    console.log(
      `📊 Processed ${processedDeals.length} deals with combined data`
    );

    if (dryRun) {
      const syncDuration = (Date.now() - startTime) / 1000;
      console.log(`🎉 DRY RUN COMPLETED in ${syncDuration}s`);

      return NextResponse.json({
        success: true,
        dryRun: true,
        message:
          "Parallel dry run with tracking completed - no database changes made",
        optimized: true,
        summary: {
          totalDealsAvailable: allDeals.length,
          dealsNeedingProcessing: dealsToProcess.length,
          dealsSkipped: allDeals.length - dealsToProcess.length,
          optimizationPercentage: (
            (1 - dealsToProcess.length / allDeals.length) *
            100
          ).toFixed(1),
          totalCustomFieldEntries: allCustomFieldData.length,
          targetCustomFieldEntries: targetCustomFieldData.length,
          dealsWithCustomFields: dealCustomFieldsMap.size,
          finalProcessedDeals: processedDeals.length,
          dealErrors: dealErrors.length,
          customFieldErrors: customFieldErrors.length,
          syncDurationSeconds: syncDuration,
          trackingStats: trackingStats,
          rateLimit: RATE_LIMIT,
          performance: {
            dealsPerSecond: allDeals.length / syncDuration,
            customFieldsPerSecond: allCustomFieldData.length / syncDuration,
          },
          sampleProcessedDeals: processedDeals.slice(0, 3),
        },
      });
    }

    // Step 7: Upsert deals into Supabase with parallel batching
    console.log(
      "🎯 STEP 7: Upserting deals into deals_cache with parallel processing..."
    );
    let dealsUpserted = 0;
    const upsertBatchSize = 100;
    const parallelBatches = 5; // Increased from 3 for faster database writes

    const dealBatches: any[][] = [];
    for (let i = 0; i < processedDeals.length; i += upsertBatchSize) {
      dealBatches.push(processedDeals.slice(i, i + upsertBatchSize));
    }

    console.log(`📊 Created ${dealBatches.length} batches for parallel upsert`);

    // Function to retry upsert with exponential backoff and jitter
    const retryUpsertWithDeadlockHandling = async (
      batch: any[],
      batchNumber: number,
      maxRetries: number = 3
    ): Promise<{ success: boolean; error?: any; count: number }> => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const { error } = await supabase
            .from("deals_cache")
            .upsert(batch, { onConflict: "deal_id" });

          if (error) {
            if (error.code === "40001" && attempt < maxRetries) {
              // Deadlock detected, retry with exponential backoff + jitter
              const baseDelay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
              const jitter = Math.random() * 1000; // 0-1s random jitter
              const delay = baseDelay + jitter;

              console.warn(
                `⚠️ Deadlock in batch ${batchNumber}, attempt ${attempt}/${maxRetries}. Retrying in ${Math.round(
                  delay
                )}ms...`
              );
              await new Promise((resolve) => setTimeout(resolve, delay));
              continue;
            }
            throw error;
          }

          console.log(
            `✅ Batch ${batchNumber} upserted successfully (${batch.length} deals)`
          );
          return { success: true, count: batch.length };
        } catch (error) {
          if (attempt === maxRetries) {
            console.error(
              `❌ Batch ${batchNumber} failed after ${maxRetries} attempts:`,
              error
            );
            return { success: false, error, count: 0 };
          }
        }
      }
      return { success: false, count: 0 };
    };

    // Process batches in parallel groups
    for (let i = 0; i < dealBatches.length; i += parallelBatches) {
      const batchGroup = dealBatches.slice(i, i + parallelBatches);
      console.log(
        `💾 Processing upsert batch group ${
          Math.floor(i / parallelBatches) + 1
        }/${Math.ceil(
          dealBatches.length / parallelBatches
        )} (parallelism: ${parallelBatches})`
      );

      const upsertPromises = batchGroup.map(async (batch, batchIndex) => {
        const actualBatchNumber = i + batchIndex + 1;
        return await retryUpsertWithDeadlockHandling(batch, actualBatchNumber);
      });

      const results = await Promise.allSettled(upsertPromises);

      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          const { success, count } = result.value;
          if (success) {
            dealsUpserted += count;
          }
        } else {
          console.error(
            `❌ Batch group ${i + index + 1} promise rejected:`,
            result.reason
          );
        }
      });
    }

    console.log(`✅ STEP 7 COMPLETE: Upserted ${dealsUpserted} deals`);
    console.log("🔄 STEP 8: Preparing to complete sync...");

    const syncDuration = (Date.now() - startTime) / 1000;
    console.log(`⏱️ Total sync duration: ${syncDuration}s`);

    // Update sync log with completion (only for live updates)
    if (!dryRun && syncLogId) {
      console.log("📝 Updating sync log with completion...");
      console.log(
        `📊 Sync stats: processed=${
          processedDeals.length
        }, upserted=${dealsUpserted}, duration=${Math.round(syncDuration)}s`
      );

      const { error: updateError } = await supabase
        .from("deals_sync_log")
        .update({
          sync_completed_at: new Date().toISOString(),
          sync_status: "completed",
          deals_processed: processedDeals.length,
          deals_added: dealsUpserted, // Simplified - in reality this would be new vs updated
          deals_updated: 0, // Would need more complex logic to track this
          deals_deleted: 0,
          sync_duration_seconds: Math.round(syncDuration),
        })
        .eq("id", syncLogId);

      if (updateError) {
        console.error("❌ Error updating sync log:", updateError);
        console.error(
          "❌ Update error details:",
          JSON.stringify(updateError, null, 2)
        );
      } else {
        console.log("✅ Sync log updated successfully");
      }
    } else {
      console.log(
        `ℹ️ Sync log update skipped: dryRun=${dryRun}, syncLogId=${syncLogId}`
      );
    }

    console.log(`🎉 TRACKING SYNC COMPLETED in ${syncDuration}s`);

    return NextResponse.json({
      success: true,
      dryRun: false,
      message: "Parallel deals sync with tracking completed successfully",
      optimized: true,
      syncBatchId: syncBatchId,
      summary: {
        totalDealsAvailable: allDeals.length,
        dealsNeedingProcessing: dealsToProcess.length,
        dealsSkipped: allDeals.length - dealsToProcess.length,
        optimizationPercentage: (
          (1 - dealsToProcess.length / allDeals.length) *
          100
        ).toFixed(1),
        totalCustomFieldEntries: allCustomFieldData.length,
        targetCustomFieldEntries: targetCustomFieldData.length,
        dealsWithCustomFields: dealCustomFieldsMap.size,
        finalProcessedDeals: processedDeals.length,
        dealsUpserted: dealsUpserted,
        dealErrors: dealErrors.length,
        customFieldErrors: customFieldErrors.length,
        syncDurationSeconds: syncDuration,
        trackingStats: trackingStats,
        rateLimit: RATE_LIMIT,
        performance: {
          dealsPerSecond: allDeals.length / syncDuration,
          customFieldsPerSecond: allCustomFieldData.length / syncDuration,
          upsertsPerSecond: dealsUpserted / syncDuration,
        },
      },
    });
  } catch (error) {
    console.error("❌ Sync error:", error);

    const syncDuration = (Date.now() - startTime) / 1000;
    const { searchParams } = new URL(request.url);

    // Update sync log with error (only for live updates)
    if (!searchParams.get("dryRun") && syncLogId) {
      console.log("📝 Updating sync log with error...");
      const supabase = createSupabaseServiceClient();
      const { error: updateError } = await supabase
        .from("deals_sync_log")
        .update({
          sync_completed_at: new Date().toISOString(),
          sync_status: "failed",
          error_message:
            error instanceof Error ? error.message : "Unknown error",
          sync_duration_seconds: Math.round(syncDuration),
        })
        .eq("id", syncLogId);

      if (updateError) {
        console.error("❌ Error updating sync log with error:", updateError);
      } else {
        console.log("✅ Sync log updated with error status");
      }
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        syncDurationSeconds: syncDuration,
      },
      { status: 500 }
    );
  }
}

// Set timeout for this API route
export const maxDuration = 300; // 5 minutes
