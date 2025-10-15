import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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

// Date conversion function
function convertDateFormat(dateString: string): string | null {
  if (!dateString) return null;

  try {
    // Handle MM/DD/YYYY format
    if (dateString.includes("/")) {
      const [month, day, year] = dateString.split("/");
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }

    // Handle YYYY-MM-DD format (already correct)
    if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return dateString;
    }

    // Try to parse as ISO date
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split("T")[0];
    }

    return null;
  } catch (error) {
    console.error("Error converting date:", dateString, error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  let syncLogId: string | null = null;

  try {
    console.log("=== ROBUST DEALS SYNC PARALLEL ===");
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
      : parseInt(searchParams.get("maxDeals") || "1000"); // No limit if allDeals=true

    console.log(`🔍 Mode: ${dryRun ? "DRY RUN" : "LIVE UPDATE"}`);
    console.log(`🗑️ Clear first: ${clearFirst ? "YES" : "NO"}`);
    console.log(
      `📊 Max deals to process: ${allDealsParam ? "ALL DEALS" : maxDeals}`
    );

    const supabase = await createSupabaseServer();

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

    // Step 2: Get custom field data with parallel pagination
    console.log(
      "🎯 STEP 2: Fetching custom field data with parallel pagination..."
    );

    // Get total custom field data count
    const firstCustomFieldUrl = new URL(
      `${BASE_URL}/api/3/dealCustomFieldData`
    );
    firstCustomFieldUrl.searchParams.set("limit", "1");
    firstCustomFieldUrl.searchParams.set("offset", "0");

    const firstCustomFieldResponse = await fetchJSON(
      firstCustomFieldUrl.toString()
    );
    const totalCustomFields = firstCustomFieldResponse.meta?.total || 0;
    const totalCustomFieldPages = Math.ceil(totalCustomFields / limit);

    console.log(
      `📊 Total custom field entries: ${totalCustomFields} in ${totalCustomFieldPages} pages`
    );

    // Create URLs for all custom field pages
    const customFieldUrls: string[] = [];
    for (let page = 0; page < totalCustomFieldPages; page++) {
      const offset = page * limit;
      const customFieldUrl = new URL(`${BASE_URL}/api/3/dealCustomFieldData`);
      customFieldUrl.searchParams.set("limit", limit.toString());
      customFieldUrl.searchParams.set("offset", offset.toString());
      customFieldUrls.push(customFieldUrl.toString());
    }

    // Fetch all custom field pages in parallel
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

    // Step 5: Process deals and combine with custom field data
    console.log(
      "🎯 STEP 5: Processing deals and combining with custom fields..."
    );
    const processedDeals = allDeals.map((deal) => {
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
        message: "Parallel dry run completed - no database changes made",
        summary: {
          totalDeals: allDeals.length,
          totalCustomFieldEntries: allCustomFieldData.length,
          targetCustomFieldEntries: targetCustomFieldData.length,
          dealsWithCustomFields: dealCustomFieldsMap.size,
          processedDeals: processedDeals.length,
          dealErrors: dealErrors.length,
          customFieldErrors: customFieldErrors.length,
          syncDurationSeconds: syncDuration,
          rateLimit: RATE_LIMIT,
          performance: {
            dealsPerSecond: allDeals.length / syncDuration,
            customFieldsPerSecond: allCustomFieldData.length / syncDuration,
          },
          sampleProcessedDeals: processedDeals.slice(0, 3),
        },
      });
    }

    // Step 6: Upsert deals into Supabase with parallel batching and deadlock handling
    console.log(
      "🎯 STEP 6: Upserting deals into Supabase with parallel processing and deadlock protection..."
    );
    let dealsUpserted = 0;
    const upsertBatchSize = 100;
    let parallelBatches = 5; // Increased from 3 for faster database writes (will be reduced if deadlocks occur)

    // Function to detect transient errors that should be retried
    const isRetriableError = (error: any): boolean => {
      // PostgreSQL Class 40 - Transaction Rollback errors
      const retriableCodes = [
        "40P01", // deadlock_detected
        "40001", // serialization_failure
        "40002", // transaction_integrity_constraint_violation
        "40003", // statement_completion_unknown
      ];

      return (
        retriableCodes.includes(error?.code) ||
        error?.message?.includes("deadlock detected") ||
        error?.details?.includes("deadlock detected") ||
        error?.message?.includes("could not serialize access") ||
        error?.message?.includes("serialization failure")
      );
    };

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
            if (isRetriableError(error) && attempt < maxRetries) {
              // Calculate exponential backoff with jitter
              const baseDelay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
              const jitter = Math.random() * 1000; // 0-1s random jitter
              const delay = baseDelay + jitter;

              console.warn(
                `⚠️ Transient error (${
                  (error as any)?.code || "unknown"
                }) in batch ${batchNumber}, attempt ${attempt}/${maxRetries}. Retrying in ${Math.round(
                  delay
                )}ms...`
              );

              await new Promise((resolve) => setTimeout(resolve, delay));
              continue;
            }

            console.error(`❌ Upsert error in batch ${batchNumber}:`, error);
            return { success: false, error, count: 0 };
          }

          console.log(
            `✅ Upserted batch ${batchNumber}: ${batch.length} deals${
              attempt > 1 ? ` (succeeded on attempt ${attempt})` : ""
            }`
          );
          return { success: true, count: batch.length };
        } catch (error) {
          if (isRetriableError(error) && attempt < maxRetries) {
            const baseDelay = Math.pow(2, attempt - 1) * 1000;
            const jitter = Math.random() * 1000;
            const delay = baseDelay + jitter;

            console.warn(
              `⚠️ Transient exception (${
                (error as any)?.code || "unknown"
              }) in batch ${batchNumber}, attempt ${attempt}/${maxRetries}. Retrying in ${Math.round(
                delay
              )}ms...`
            );

            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }

          console.error(`❌ Upsert exception in batch ${batchNumber}:`, error);
          return { success: false, error, count: 0 };
        }
      }

      return {
        success: false,
        error: new Error(
          `Max retries (${maxRetries}) exceeded for batch ${batchNumber}`
        ),
        count: 0,
      };
    };

    const dealBatches: any[][] = [];
    for (let i = 0; i < processedDeals.length; i += upsertBatchSize) {
      dealBatches.push(processedDeals.slice(i, i + upsertBatchSize));
    }

    console.log(`📊 Created ${dealBatches.length} batches for parallel upsert`);

    let deadlockCount = 0;
    const maxDeadlocks = 5; // If we hit this many deadlocks, reduce parallelism

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

      const batchResults = await Promise.allSettled(upsertPromises);

      // Check for transient errors and adjust parallelism
      let groupTransientErrorCount = 0;
      batchResults.forEach((result) => {
        if (result.status === "fulfilled") {
          if (result.value.success) {
            dealsUpserted += result.value.count;
          } else if (isRetriableError(result.value.error)) {
            groupTransientErrorCount++;
          }
        }
      });

      deadlockCount += groupTransientErrorCount;

      // Reduce parallelism if too many transient errors
      if (deadlockCount >= maxDeadlocks && parallelBatches > 1) {
        parallelBatches = Math.max(1, Math.floor(parallelBatches / 2));
        console.warn(
          `⚠️ Too many transient errors detected (${deadlockCount}). Reducing parallelism to ${parallelBatches}`
        );
        deadlockCount = 0; // Reset counter after adjustment
      }

      // Adaptive delay between batch groups based on transient error frequency
      if (i + parallelBatches < dealBatches.length) {
        const adaptiveDelay =
          groupTransientErrorCount > 0
            ? 500 + groupTransientErrorCount * 200
            : 100;
        await new Promise((resolve) => setTimeout(resolve, adaptiveDelay));
      }
    }

    const syncDuration = (Date.now() - startTime) / 1000;
    console.log(`🎉 PARALLEL SYNC COMPLETED in ${syncDuration}s`);

    // Update sync log with completion (only for live updates)
    if (!dryRun && syncLogId) {
      console.log("📝 Updating sync log with completion...");
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
      } else {
        console.log("✅ Sync log updated successfully");
      }
    }

    return NextResponse.json({
      success: true,
      dryRun: false,
      message: "Parallel deals sync completed successfully",
      summary: {
        totalDeals: allDeals.length,
        totalCustomFieldEntries: allCustomFieldData.length,
        targetCustomFieldEntries: targetCustomFieldData.length,
        dealsWithCustomFields: dealCustomFieldsMap.size,
        processedDeals: processedDeals.length,
        dealsUpserted: dealsUpserted,
        dealErrors: dealErrors.length,
        customFieldErrors: customFieldErrors.length,
        syncDurationSeconds: syncDuration,
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

    // Update sync log with error (only for live updates)
    if (syncLogId) {
      console.log("📝 Updating sync log with error...");
      const supabase = await createSupabaseServer();
      const { error: updateError } = await supabase
        .from("deals_sync_log")
        .update({
          sync_completed_at: new Date().toISOString(),
          sync_status: "failed",
          sync_duration_seconds: Math.round(syncDuration),
          error_message:
            error instanceof Error ? error.message : "Unknown error",
        })
        .eq("id", syncLogId);

      if (updateError) {
        console.error("❌ Error updating sync log with error:", updateError);
      } else {
        console.log("✅ Sync log updated with error");
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
