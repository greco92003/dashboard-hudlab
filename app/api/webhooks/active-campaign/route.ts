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

// Fetch contact field values for a specific contact
async function fetchContactFieldValues(contactId: string) {
  const res = await fetch(
    `${BASE_URL}/api/3/contacts/${contactId}/fieldValues`,
    {
      headers: { "Api-Token": API_TOKEN!, "Content-Type": "application/json" },
    },
  );
  if (!res.ok)
    throw new Error(`AC API error fetching contact fields: ${res.status}`);
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

    // Fetch contact field values if contact exists
    let contactFieldsResponse = null;
    if (deal.contact) {
      console.log(`🔍 Fetching contact fields for contact ID: ${deal.contact}`);
      contactFieldsResponse = await fetchContactFieldValues(deal.contact);
      console.log(
        `✅ Contact fields response:`,
        JSON.stringify(contactFieldsResponse, null, 2),
      );
    } else {
      console.warn(`⚠️ Deal ${dealId} has no contact associated`);
    }

    // Build custom fields map (deal fields)
    const customFieldsMap = new Map<number, string>();
    const customFieldData: any[] =
      customFieldsResponse.dealCustomFieldData || [];

    console.log(
      `📊 Processing ${customFieldData.length} deal custom field entries`,
    );

    // Filter by dealId AND customFieldId
    customFieldData
      .filter((item: any) => {
        const itemDealId = parseInt(item.dealId);
        const itemFieldId = parseInt(item.customFieldId);
        const matchesDeal = itemDealId === parseInt(dealId);
        const matchesField = TARGET_CUSTOM_FIELD_IDS.includes(itemFieldId);

        if (matchesDeal && matchesField) {
          console.log(
            `✅ Found deal field ${itemFieldId} for deal ${dealId}: ${item.fieldValue || "(empty)"}`,
          );
        }

        return matchesDeal && matchesField;
      })
      .forEach((item: any) => {
        customFieldsMap.set(
          parseInt(item.customFieldId),
          item.fieldValue || "",
        );
      });

    console.log(`📊 Deal custom fields map size: ${customFieldsMap.size}`);

    // Build contact fields map (contact fields 7 and 50)
    const contactFieldsMap = new Map<number, string>();
    if (contactFieldsResponse) {
      const contactFieldValues: any[] = contactFieldsResponse.fieldValues || [];
      console.log(
        `📊 Processing ${contactFieldValues.length} contact field values`,
      );
      contactFieldValues
        .filter((item: any) => {
          const fieldId = parseInt(item.field);
          return fieldId === 7 || fieldId === 50; // Segmento de Negócio and Intenção de Compra
        })
        .forEach((item: any) => {
          console.log(
            `✅ Found contact field ${item.field}: ${item.value || "(empty)"}`,
          );
          contactFieldsMap.set(parseInt(item.field), item.value || "");
        });
    }
    console.log(
      `📊 Contact fields map size: ${contactFieldsMap.size}, Field 7: ${contactFieldsMap.get(7) || "null"}, Field 50: ${contactFieldsMap.get(50) || "null"}`,
    );

    // Transform deal using the same mapping as the sync route
    const closingDate = customFieldsMap.get(5) || null;
    const estado = customFieldsMap.get(25) || null;
    const quantidadeDePares = customFieldsMap.get(39) || null;
    const vendedor = customFieldsMap.get(45) || null;
    const designer = customFieldsMap.get(47) || null;
    const utmSource = customFieldsMap.get(49) || null;
    const utmMedium = customFieldsMap.get(50) || null;

    // Contact custom field values (field 7 = Segmento de Negócio, field 50 = Intenção de Compra)
    const segmentoDeNegocio = contactFieldsMap.get(7) || null;
    const intencaoDeCompra = contactFieldsMap.get(50) || null;

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
      segmento_de_negocio: segmentoDeNegocio,
      intencao_de_compra: intencaoDeCompra,
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

    // ── Ghost deal healing ───────────────────────────────────────────────────
    // When a deal comes in with value = 0, it may be an orphan created by
    // ActiveCampaign during a bulk owner reassignment. We look for a sibling
    // deal on the same contact that carries the real data (value > 0) and copy
    // the key fields over so the dashboard reflects accurate information.
    let ghostHealed = false;
    try {
      const dealValue = parseFloat(deal.value || "0");
      const contactId = deal.contact?.toString();

      if (dealValue === 0 && contactId) {
        console.log(
          `🔍 Deal ${dealId} has value=0 — checking for ghost sibling on contact ${contactId}`,
        );

        const { data: siblings } = await supabase
          .from("deals_cache")
          .select(
            `deal_id, title, value, status, stage_id, closing_date, custom_field_value, custom_field_id, estado, vendedor, designer, "quantidade-de-pares", "utm-source", "utm-medium", segmento_de_negocio, intencao_de_compra`,
          )
          .eq("contact_id", contactId)
          .neq("deal_id", dealId)
          .gt("value", 0)
          .order("value", { ascending: false })
          .limit(1);

        if (siblings && siblings.length > 0) {
          const ghost = siblings[0];
          console.log(
            `👻 Ghost deal detected! Healing active deal ${dealId} with data from ghost deal ${ghost.deal_id} (value: ${ghost.value}, title: "${ghost.title}")`,
          );

          // Copy ALL fields from ghost — status, closing_date, value, title, etc.
          const healPatch = {
            title: ghost.title,
            value: ghost.value,
            status: ghost.status,
            stage_id: ghost.stage_id,
            closing_date: ghost.closing_date,
            custom_field_value: ghost.custom_field_value,
            custom_field_id: ghost.custom_field_id,
            estado: ghost.estado,
            "quantidade-de-pares": ghost["quantidade-de-pares"],
            vendedor: ghost.vendedor,
            designer: ghost.designer,
            "utm-source": ghost["utm-source"],
            "utm-medium": ghost["utm-medium"],
            segmento_de_negocio: ghost.segmento_de_negocio,
            intencao_de_compra: ghost.intencao_de_compra,
          };

          await Promise.all([
            supabase
              .from("deals_cache")
              .update(healPatch)
              .eq("deal_id", dealId),
            supabase.from("deals_live").update(healPatch).eq("deal_id", dealId),
          ]);

          ghostHealed = true;
          console.log(
            `✅ Ghost healing complete for deal ${dealId} — adopted data from ghost ${ghost.deal_id}`,
          );
        } else {
          console.log(
            `ℹ️ No ghost sibling found for deal ${dealId} on contact ${contactId}`,
          );
        }
      }
    } catch (ghostError) {
      // Healing is non-critical — never fail the main webhook response
      console.error(`⚠️ Ghost healing error for deal ${dealId}:`, ghostError);
    }
    // ────────────────────────────────────────────────────────────────────────

    const totalTime = Date.now() - startTime;
    console.log(
      `✅ Deal ${dealId} updated in deals_cache + deals_live in ${totalTime}ms`,
    );

    return NextResponse.json({
      success: true,
      deal_id: dealId,
      ghost_healed: ghostHealed,
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
