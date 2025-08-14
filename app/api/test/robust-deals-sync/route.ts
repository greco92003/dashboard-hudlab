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

async function fetchJSON(url: string, timeout = 60000) {
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

async function fetchJSONWithRetry(
  url: string,
  maxRetries = 3,
  timeout = 60000
) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Attempt ${attempt}/${maxRetries} for URL: ${url}`);
      return await fetchJSON(url, timeout);
    } catch (error) {
      lastError = error;
      console.error(`❌ Attempt ${attempt} failed:`, error);

      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  console.error(`❌ All ${maxRetries} attempts failed for URL: ${url}`);
  throw lastError;
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

    // Handle other formats by parsing as Date
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split("T")[0];
    }
  } catch (error) {
    console.error("Error converting date:", dateString, error);
  }

  console.warn(`Unrecognized date format: ${dateString}`);
  return null;
}

// GET endpoint for robust deals sync
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    console.log("=== ROBUST DEALS SYNC ===");
    console.log(
      `🎯 Target custom field IDs: ${TARGET_CUSTOM_FIELD_IDS.join(", ")}`
    );

    const supabase = await createSupabaseServer();

    // Use a more robust approach with atomic check-and-insert
    console.log("🔍 Performing atomic check for running syncs...");

    // First, try to insert a new sync log entry
    // This will help us detect race conditions
    const { data: syncLog, error: syncLogError } = await supabase
      .from("deals_sync_log")
      .insert({
        sync_status: "running",
        deals_processed: 0,
      })
      .select()
      .single();

    if (syncLogError) {
      console.error("❌ Error creating sync log:", syncLogError);
      return NextResponse.json(
        { error: "Failed to create sync log" },
        { status: 500 }
      );
    }

    console.log(`✅ Created sync log entry:`, syncLog);

    // Now check if there are any OTHER running syncs (excluding the one we just created)
    const { data: otherRunningSyncs, error: checkError } = await supabase
      .from("deals_sync_log")
      .select("id, sync_status, sync_started_at")
      .eq("sync_status", "running")
      .neq("id", syncLog.id) // Exclude the one we just created
      .limit(1);

    if (checkError) {
      console.error("❌ Error checking for other running syncs:", checkError);
    }

    console.log(
      `🔍 Found ${otherRunningSyncs?.length || 0} other running syncs:`,
      otherRunningSyncs
    );

    if (otherRunningSyncs && otherRunningSyncs.length > 0) {
      console.log(
        "❌ Another sync is already running, cleaning up and rejecting"
      );
      console.log("❌ Other running sync details:", otherRunningSyncs[0]);

      // Clean up the sync log we just created
      await supabase.from("deals_sync_log").delete().eq("id", syncLog.id);

      return NextResponse.json(
        {
          error:
            "Uma sincronização já está em andamento. Aguarde a finalização para iniciar outra.",
          isRunning: true,
          runningSyncId: otherRunningSyncs[0].id,
          runningSyncStartedAt: otherRunningSyncs[0].sync_started_at,
        },
        { status: 409 } // Conflict status
      );
    }

    console.log("✅ No other running syncs found, proceeding with sync...");
    console.log(`🚀 Starting test sync job ${syncLog.id}...`);

    if (!BASE_URL || !API_TOKEN) {
      return NextResponse.json(
        { error: "Missing environment variables. Check .env file." },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const clearFirst = searchParams.get("clearFirst") === "true";
    const dryRun = searchParams.get("dryRun") === "true";

    console.log(`🔍 Mode: ${dryRun ? "DRY RUN" : "LIVE UPDATE"}`);
    console.log(`🗑️ Clear first: ${clearFirst ? "YES" : "NO"}`);

    // Step 0: Clear deals_cache if requested
    if (clearFirst && !dryRun) {
      console.log("🗑️ STEP 0: Clearing deals_cache table...");
      const { error: deleteError } = await supabase
        .from("deals_cache")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all records

      if (deleteError) {
        console.error("Error clearing table:", deleteError);
        return NextResponse.json(
          { error: "Failed to clear table" },
          { status: 500 }
        );
      }
      console.log("✅ deals_cache table cleared");
    }

    // Step 1: Get ALL deals with pagination
    console.log("🎯 STEP 1: Fetching ALL deals...");
    let allDeals: any[] = [];
    let offset = 0;
    const limit = 100;
    let hasMoreData = true;

    while (hasMoreData) {
      try {
        const dealsUrl = new URL(`${BASE_URL}/api/3/deals`);
        dealsUrl.searchParams.set("limit", limit.toString());
        dealsUrl.searchParams.set("offset", offset.toString());

        console.log(`📄 Fetching deals: offset=${offset}, limit=${limit}`);

        const response = await fetchJSONWithRetry(dealsUrl.toString());
        const deals = response.deals || [];

        if (deals.length === 0) {
          hasMoreData = false;
          console.log(`✅ No more deals at offset ${offset}`);
        } else {
          allDeals = [...allDeals, ...deals];
          offset += limit;

          console.log(
            `📦 Fetched ${deals.length} deals, total: ${allDeals.length}`
          );

          if (deals.length < limit) {
            hasMoreData = false;
            console.log(
              `✅ Reached end of deals (got ${deals.length} < ${limit})`
            );
          }

          // Small delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`❌ Error fetching deals at offset ${offset}:`, error);
        // Continue with next batch instead of failing completely
        offset += limit;
        if (offset > 10000) {
          // Safety limit to prevent infinite loop
          console.error(
            `❌ Too many failed attempts, stopping at offset ${offset}`
          );
          hasMoreData = false;
        }
      }
    }

    console.log(`📊 STEP 1 COMPLETE: Found ${allDeals.length} total deals`);

    // Step 2: Get ALL custom field values with pagination
    console.log("🎯 STEP 2: Fetching ALL custom field values...");
    let allCustomFieldData: any[] = [];
    offset = 0;
    hasMoreData = true;

    while (hasMoreData) {
      try {
        const customFieldUrl = new URL(`${BASE_URL}/api/3/dealCustomFieldData`);
        customFieldUrl.searchParams.set("limit", limit.toString());
        customFieldUrl.searchParams.set("offset", offset.toString());

        console.log(
          `📄 Fetching custom fields: offset=${offset}, limit=${limit}`
        );

        const response = await fetchJSONWithRetry(customFieldUrl.toString());
        const customFieldData = response.dealCustomFieldData || [];

        if (customFieldData.length === 0) {
          hasMoreData = false;
          console.log(`✅ No more custom field data at offset ${offset}`);
        } else {
          allCustomFieldData = [...allCustomFieldData, ...customFieldData];
          offset += limit;

          console.log(
            `📦 Fetched ${customFieldData.length} custom field entries, total: ${allCustomFieldData.length}`
          );

          if (customFieldData.length < limit) {
            hasMoreData = false;
            console.log(
              `✅ Reached end of custom field data (got ${customFieldData.length} < ${limit})`
            );
          }

          // Small delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(
          `❌ Error fetching custom fields at offset ${offset}:`,
          error
        );
        // Continue with next batch instead of failing completely
        offset += limit;
        if (offset > 10000) {
          // Safety limit to prevent infinite loop
          console.error(
            `❌ Too many failed attempts, stopping at offset ${offset}`
          );
          hasMoreData = false;
        }
      }
    }

    console.log(
      `📊 STEP 2 COMPLETE: Found ${allCustomFieldData.length} total custom field entries`
    );

    // Step 3: Filter and organize custom field data
    console.log("🎯 STEP 3: Filtering and organizing custom field data...");

    // Filter for only our target custom field IDs
    const targetCustomFieldData = allCustomFieldData.filter((item) =>
      TARGET_CUSTOM_FIELD_IDS.includes(item.dealCustomFieldMetumId)
    );

    console.log(
      `📊 Filtered to ${targetCustomFieldData.length} target custom field entries`
    );

    // Create map of custom fields by deal ID
    const dealCustomFieldsMap = new Map<string, Map<number, string>>();
    targetCustomFieldData.forEach((item) => {
      const dealId = item.dealId.toString();
      const fieldId = item.dealCustomFieldMetumId;

      if (!dealCustomFieldsMap.has(dealId)) {
        dealCustomFieldsMap.set(dealId, new Map<number, string>());
      }

      dealCustomFieldsMap.get(dealId)!.set(fieldId, item.fieldValue);
    });

    console.log(
      `📊 Found ${dealCustomFieldsMap.size} deals with target custom fields`
    );

    // Step 4: Combine deals with custom field data and process
    console.log("🎯 STEP 4: Combining deals with custom field data...");

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

    // Filter to only deals that have at least one of our custom fields (optional)
    const dealsWithCustomFields = processedDeals.filter(
      (deal) =>
        deal.estado ||
        deal["quantidade-de-pares"] ||
        deal.vendedor ||
        deal.designer ||
        deal["utm-source"] ||
        deal["utm-medium"] ||
        deal.custom_field_value
    );

    console.log(
      `📊 STEP 4 COMPLETE: Processed ${processedDeals.length} total deals`
    );
    console.log(
      `📊 ${dealsWithCustomFields.length} deals have at least one custom field`
    );

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        message: "Dry run completed - no database changes made",
        summary: {
          totalDeals: allDeals.length,
          totalCustomFieldEntries: allCustomFieldData.length,
          targetCustomFieldEntries: targetCustomFieldData.length,
          dealsWithCustomFields: dealsWithCustomFields.length,
          allProcessedDeals: processedDeals.length,
          sampleDealsWithCustomFields: dealsWithCustomFields.slice(0, 3),
          sampleAllDeals: processedDeals.slice(0, 2),
        },
      });
    }

    // Step 5: Upsert ALL deals into Supabase (batch upsert for speed)
    console.log("🎯 STEP 5: Upserting ALL deals into Supabase...");
    let dealsUpserted = 0;
    const upsertBatchSize = 100; // Upsert 100 deals at once for better performance

    let failedBatches = 0;

    for (let i = 0; i < processedDeals.length; i += upsertBatchSize) {
      const batch = processedDeals.slice(i, i + upsertBatchSize);
      const batchNumber = Math.floor(i / upsertBatchSize) + 1;
      const totalBatches = Math.ceil(processedDeals.length / upsertBatchSize);

      console.log(
        `📦 Upserting batch ${batchNumber}/${totalBatches} (${batch.length} deals)...`
      );

      try {
        const { error } = await supabase.from("deals_cache").upsert(batch, {
          onConflict: "deal_id",
          ignoreDuplicates: false,
        });

        if (error) {
          console.error(`❌ Error upserting batch ${batchNumber}:`, error);
          failedBatches++;
          // Continue with next batch even if this one fails
        } else {
          dealsUpserted += batch.length;
          console.log(
            `✅ Successfully upserted ${batch.length} deals in batch ${batchNumber}`
          );
        }
      } catch (error) {
        console.error(`❌ Exception upserting batch ${batchNumber}:`, error);
        failedBatches++;
        // Continue with next batch even if this one fails
      }

      // Small delay between batches to avoid overwhelming the database
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    if (failedBatches > 0) {
      console.warn(`⚠️ ${failedBatches} batches failed during upsert`);
    }

    console.log(
      `✅ STEP 5 COMPLETE: Upserted ${dealsUpserted} deals into database`
    );

    // Update sync log with completion
    const syncDuration = Math.round((Date.now() - startTime) / 1000);
    console.log(`📝 Updating sync log ${syncLog.id} with completion status...`);

    const { error: updateError } = await supabase
      .from("deals_sync_log")
      .update({
        sync_status: "completed",
        sync_completed_at: new Date().toISOString(),
        deals_processed: processedDeals.length,
        deals_added: dealsUpserted,
        deals_updated: 0,
        sync_duration_seconds: syncDuration,
      })
      .eq("id", syncLog.id);

    if (updateError) {
      console.error("❌ Error updating sync log:", updateError);
    } else {
      console.log(
        `✅ Successfully updated sync log ${syncLog.id} to completed`
      );
    }

    console.log(`🎉 SYNC COMPLETED SUCCESSFULLY in ${syncDuration}s`);

    return NextResponse.json({
      success: true,
      dryRun: false,
      message: "Robust deals sync completed successfully",
      syncLogId: syncLog.id,
      summary: {
        totalDeals: allDeals.length,
        totalCustomFieldEntries: allCustomFieldData.length,
        targetCustomFieldEntries: targetCustomFieldData.length,
        dealsWithCustomFields: dealsWithCustomFields.length,
        allProcessedDeals: processedDeals.length,
        dealsUpserted: dealsUpserted,
        syncDurationSeconds: syncDuration,
      },
    });
  } catch (error) {
    console.error("Robust deals sync error:", error);

    // Update sync log with error
    const syncDuration = Math.round((Date.now() - startTime) / 1000);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    try {
      const supabase = await createSupabaseServer();
      console.log(`📝 Updating sync log with error status...`);

      // Try to get some stats even if sync failed
      let partialStats = {};
      try {
        const { count: totalDealsInCache } = await supabase
          .from("deals_cache")
          .select("*", { count: "exact", head: true });
        partialStats = { totalDealsInCache };
      } catch (statsError) {
        console.error("Could not get partial stats:", statsError);
      }

      const { error: updateError } = await supabase
        .from("deals_sync_log")
        .update({
          sync_status: "failed",
          sync_completed_at: new Date().toISOString(),
          error_message: errorMessage,
          sync_duration_seconds: syncDuration,
        })
        .eq("sync_status", "running")
        .order("sync_started_at", { ascending: false })
        .limit(1);

      if (updateError) {
        console.error("❌ Error updating sync log with failure:", updateError);
      } else {
        console.log(`✅ Successfully updated sync log to failed`);
      }
    } catch (logError) {
      console.error("❌ Exception updating sync log:", logError);
    }

    return NextResponse.json(
      {
        error: errorMessage,
        success: false,
        syncDurationSeconds: syncDuration,
        message:
          "Sync failed but may have processed some data. Check logs for details.",
      },
      { status: 500 }
    );
  }
}
