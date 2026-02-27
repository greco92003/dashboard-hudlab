import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const BASE_URL = process.env.NEXT_PUBLIC_AC_BASE_URL;
const API_TOKEN = process.env.AC_API_TOKEN;

// Only need field 5 (Data Fechamento) for live dashboard date tracking
const TARGET_CUSTOM_FIELD_IDS = [5];

const headers = {
  "Api-Token": API_TOKEN || "",
  "Content-Type": "application/json",
};

// Rate limiting — same config as robust-deals-sync
const RATE_LIMIT = {
  BATCH_SIZE: 10,
  MIN_BATCH_INTERVAL: 700,
  SAFETY_BUFFER: 50,
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function convertDateFormat(dateString: string): string | null {
  if (!dateString) return null;
  try {
    if (dateString.includes("/")) {
      const [month, day, year] = dateString.split("/");
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
    if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) return dateString;
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) return date.toISOString().split("T")[0];
    return null;
  } catch {
    return null;
  }
}

// Enhanced fetch with timeout and retry (from robust-deals-sync)
async function fetchJSON(url: string, timeout = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`AC API error ${res.status}: ${errorText}`);
    }
    return res.json();
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// Parallel fetch with rate limiting and retry (from robust-deals-sync)
async function fetchJSONParallel(urls: string[], maxRetries = 3) {
  const results: any[] = [];
  const errors: any[] = [];

  for (let i = 0; i < urls.length; i += RATE_LIMIT.BATCH_SIZE) {
    const batchStartTime = Date.now();
    const batch = urls.slice(i, i + RATE_LIMIT.BATCH_SIZE);
    console.log(
      `🔄 Batch ${Math.floor(i / RATE_LIMIT.BATCH_SIZE) + 1}/${Math.ceil(urls.length / RATE_LIMIT.BATCH_SIZE)}: ${batch.length} requests`,
    );

    const batchPromises = batch.map(async (url) => {
      let lastError;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const result = await fetchJSON(url);
          return { result, success: true };
        } catch (error) {
          lastError = error;
          if (attempt < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 3000);
            await new Promise((r) => setTimeout(r, delay));
          }
        }
      }
      return { error: lastError, success: false };
    });

    const batchResults = await Promise.allSettled(batchPromises);
    batchResults.forEach((r) => {
      if (r.status === "fulfilled") {
        if (r.value.success) results.push(r.value.result);
        else errors.push(r.value.error);
      } else {
        errors.push(r.reason);
      }
    });

    // Adaptive delay between batches
    if (i + RATE_LIMIT.BATCH_SIZE < urls.length) {
      const elapsed = Date.now() - batchStartTime;
      const delay = Math.max(
        0,
        RATE_LIMIT.MIN_BATCH_INTERVAL - elapsed + RATE_LIMIT.SAFETY_BUFFER,
      );
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    }
  }

  console.log(
    `✅ Parallel fetch: ${results.length} ok, ${errors.length} failed`,
  );
  return { results, errors };
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  try {
    if (!BASE_URL || !API_TOKEN) {
      return NextResponse.json(
        { error: "Missing AC env vars" },
        { status: 500 },
      );
    }

    console.log("=== SEEDING deals_live TABLE ===");

    // Step 1: Get total deals and build paginated URLs
    const firstPage = await fetchJSON(
      `${BASE_URL}/api/3/deals?limit=1&offset=0`,
    );
    const totalDeals = firstPage.meta?.total || 0;
    const limit = 100;
    const totalPages = Math.ceil(totalDeals / limit);
    console.log(`📊 Total deals: ${totalDeals} in ${totalPages} pages`);

    const dealUrls: string[] = [];
    for (let p = 0; p < totalPages; p++) {
      dealUrls.push(
        `${BASE_URL}/api/3/deals?limit=${limit}&offset=${p * limit}`,
      );
    }

    // Fetch all deals in parallel with rate limiting
    const { results: dealResults, errors: dealErrors } =
      await fetchJSONParallel(dealUrls);
    let allDeals: any[] = [];
    dealResults.forEach((r) => {
      if (r.deals) allDeals.push(...r.deals);
    });
    console.log(
      `📊 Fetched ${allDeals.length} deals (${dealErrors.length} errors)`,
    );

    // Step 2: Get total custom fields and build paginated URLs
    const firstCF = await fetchJSON(
      `${BASE_URL}/api/3/dealCustomFieldData?limit=1&offset=0`,
    );
    const totalCF = firstCF.meta?.total || 0;
    const cfPages = Math.ceil(totalCF / limit);
    console.log(
      `📊 Total custom field entries: ${totalCF} in ${cfPages} pages`,
    );

    const cfUrls: string[] = [];
    for (let p = 0; p < cfPages; p++) {
      cfUrls.push(
        `${BASE_URL}/api/3/dealCustomFieldData?limit=${limit}&offset=${p * limit}`,
      );
    }

    // Fetch all custom fields in parallel with rate limiting
    const { results: cfResults, errors: cfErrors } =
      await fetchJSONParallel(cfUrls);
    let allCF: any[] = [];
    cfResults.forEach((r) => {
      if (r.dealCustomFieldData) allCF.push(...r.dealCustomFieldData);
    });
    console.log(
      `📊 Fetched ${allCF.length} custom field entries (${cfErrors.length} errors)`,
    );

    // Step 3: Filter and build custom fields lookup map
    const targetCF = allCF.filter((item) =>
      TARGET_CUSTOM_FIELD_IDS.includes(parseInt(item.customFieldId)),
    );
    const cfMap = new Map<string, Map<number, string>>();
    targetCF.forEach((item) => {
      const dealId = item.dealId.toString();
      if (!cfMap.has(dealId)) cfMap.set(dealId, new Map());
      cfMap
        .get(dealId)!
        .set(parseInt(item.customFieldId), item.fieldValue || "");
    });
    console.log(
      `📊 Custom field 5 (Data Fechamento) found for ${cfMap.size} deals`,
    );

    // Step 4: Process deals — only fields needed for live dashboard
    const processed = allDeals.map((deal) => {
      const cf = cfMap.get(deal.id.toString()) || new Map();
      const closingDate = cf.get(5) || null; // Data Fechamento (custom field 5)
      return {
        deal_id: deal.id,
        title: deal.title || "",
        value: parseFloat(deal.value || "0"),
        currency: deal.currency || "BRL",
        status: deal.status || null,
        stage_id: deal.stage || null,
        closing_date: closingDate ? convertDateFormat(closingDate) : null,
        created_date: deal.cdate || null,
        custom_field_value: closingDate,
        custom_field_id: "5",
        contact_id: deal.contact || null,
        organization_id: deal.organization || null,
        api_updated_at: deal.mdate || deal.cdate || null,
        last_synced_at: new Date().toISOString(),
        sync_status: "synced" as const,
      };
    });

    // Step 5: Clear and upsert into deals_live
    console.log("🗑️ Clearing deals_live table...");
    await supabase
      .from("deals_live")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    const batchSize = 100;
    let upserted = 0;
    for (let i = 0; i < processed.length; i += batchSize) {
      const batch = processed.slice(i, i + batchSize);
      const { error } = await supabase
        .from("deals_live")
        .upsert(batch, { onConflict: "deal_id" });
      if (error) console.error(`❌ Batch error at ${i}:`, error.message);
      else upserted += batch.length;
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Seeded ${upserted} deals into deals_live in ${duration}s`);

    return NextResponse.json({
      success: true,
      total_deals: allDeals.length,
      custom_field_entries: allCF.length,
      deals_with_closing_date: cfMap.size,
      upserted,
      errors: { deals: dealErrors.length, customFields: cfErrors.length },
      duration_seconds: parseFloat(duration),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ Seed error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
