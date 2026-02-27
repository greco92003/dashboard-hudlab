import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const BASE_URL = process.env.NEXT_PUBLIC_AC_BASE_URL;
const API_TOKEN = process.env.AC_API_TOKEN;
const WEBHOOK_SECRET = process.env.AC_WEBHOOK_SECRET;

// Custom field IDs (same as the sync route)
const TARGET_CUSTOM_FIELD_IDS = [5, 25, 39, 45, 47, 49, 50];

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Date conversion helper (same logic as robust-deals-sync)
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

// Fetch deal details from ActiveCampaign
async function fetchDealFromAC(dealId: string) {
  const res = await fetch(`${BASE_URL}/api/3/deals/${dealId}`, {
    headers: { "Api-Token": API_TOKEN!, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`AC API error fetching deal: ${res.status}`);
  return res.json();
}

// Fetch custom field data for a specific deal
async function fetchDealCustomFields(dealId: string) {
  const res = await fetch(
    `${BASE_URL}/api/3/dealCustomFieldData?deal=${dealId}&limit=100`,
    {
      headers: { "Api-Token": API_TOKEN!, "Content-Type": "application/json" },
    },
  );
  if (!res.ok)
    throw new Error(`AC API error fetching custom fields: ${res.status}`);
  return res.json();
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Optional secret token validation via query param
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    if (WEBHOOK_SECRET && token !== WEBHOOK_SECRET) {
      console.warn("❌ ActiveCampaign webhook: invalid secret token");
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!BASE_URL || !API_TOKEN) {
      return NextResponse.json(
        { error: "Missing ActiveCampaign environment variables" },
        { status: 500 },
      );
    }

    // ActiveCampaign sends URL-encoded form data
    const contentType = request.headers.get("content-type") || "";
    let dealId: string | null = null;

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const text = await request.text();
      const params = new URLSearchParams(text);
      dealId = params.get("deal[id]");
    } else {
      // Fallback: try JSON
      const body = await request.json().catch(() => null);
      dealId = body?.deal?.id?.toString() ?? body?.dealId?.toString() ?? null;
    }

    if (!dealId) {
      console.error("❌ ActiveCampaign webhook: missing deal[id] in payload");
      return NextResponse.json({ error: "Missing deal[id]" }, { status: 400 });
    }

    console.log(
      `🔔 ActiveCampaign deal update webhook received for deal ID: ${dealId}`,
    );

    // Fetch deal details and custom fields in parallel
    const [dealResponse, customFieldsResponse] = await Promise.all([
      fetchDealFromAC(dealId),
      fetchDealCustomFields(dealId),
    ]);

    const deal = dealResponse.deal;
    if (!deal) throw new Error("Deal not found in ActiveCampaign response");

    // Build custom fields map
    const customFieldsMap = new Map<number, string>();
    const customFieldData: any[] =
      customFieldsResponse.dealCustomFieldData || [];
    customFieldData
      .filter((item: any) =>
        TARGET_CUSTOM_FIELD_IDS.includes(parseInt(item.customFieldId)),
      )
      .forEach((item: any) => {
        customFieldsMap.set(
          parseInt(item.customFieldId),
          item.fieldValue || "",
        );
      });

    // Transform deal using the same mapping as the sync route
    const closingDate = customFieldsMap.get(5) || null;
    const estado = customFieldsMap.get(25) || null;
    const quantidadeDePares = customFieldsMap.get(39) || null;
    const vendedor = customFieldsMap.get(45) || null;
    const designer = customFieldsMap.get(47) || null;
    const utmSource = customFieldsMap.get(49) || null;
    const utmMedium = customFieldsMap.get(50) || null;

    const processedDeal = {
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
      estado,
      "quantidade-de-pares": quantidadeDePares,
      vendedor,
      designer,
      "utm-source": utmSource,
      "utm-medium": utmMedium,
      contact_id: deal.contact || null,
      organization_id: deal.organization || null,
      api_updated_at: deal.mdate || deal.cdate || null,
      last_synced_at: new Date().toISOString(),
      sync_status: "synced" as const,
    };

    // Upsert into deals_cache AND deals_live in parallel
    const [cacheResult, liveResult] = await Promise.all([
      supabase
        .from("deals_cache")
        .upsert(processedDeal, { onConflict: "deal_id" }),
      supabase
        .from("deals_live")
        .upsert(processedDeal, { onConflict: "deal_id" }),
    ]);

    if (cacheResult.error) {
      console.error(
        "❌ Error upserting deal into deals_cache:",
        cacheResult.error,
      );
      throw new Error(
        `Supabase deals_cache upsert error: ${cacheResult.error.message}`,
      );
    }

    if (liveResult.error) {
      console.error(
        "❌ Error upserting deal into deals_live:",
        liveResult.error,
      );
      // Don't throw - deals_cache was successful, log the error
    }

    const totalTime = Date.now() - startTime;
    console.log(
      `✅ Deal ${dealId} updated in deals_cache + deals_live in ${totalTime}ms`,
    );

    return NextResponse.json({
      success: true,
      deal_id: dealId,
      processing_time_ms: totalTime,
    });
  } catch (error) {
    const totalTime = Date.now() - startTime;
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ ActiveCampaign webhook error:", error);
    return NextResponse.json(
      { success: false, error: message, processing_time_ms: totalTime },
      { status: 500 },
    );
  }
}
