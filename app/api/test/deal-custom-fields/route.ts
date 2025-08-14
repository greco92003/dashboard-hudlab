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

// GET endpoint to fetch custom field values for a specific deal
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

    // Get deal ID from query parameters (default to 10334)
    const { searchParams } = new URL(request.url);
    const dealId = searchParams.get("dealId") || "10334";

    console.log(`🔍 Fetching custom field values for deal ID: ${dealId}`);

    // First, get basic deal information
    const dealUrl = `${BASE_URL}/api/3/deals/${dealId}`;
    console.log("🌐 Fetching deal info from:", dealUrl);

    let dealInfo = null;
    try {
      const dealResponse = await fetchJSON(dealUrl);
      dealInfo = dealResponse.deal;
      console.log(`✅ Deal found: ${dealInfo.title}`);
    } catch (error) {
      console.error("❌ Error fetching deal info:", error);
      return NextResponse.json(
        {
          error: `Deal with ID ${dealId} not found`,
          dealId: dealId,
          timestamp: new Date().toISOString()
        },
        { status: 404 }
      );
    }

    // Get custom field values for this deal using the correct endpoint
    const customFieldsUrl = `${BASE_URL}/api/3/deals/${dealId}/dealCustomFieldData`;
    console.log("🏷️ Fetching custom field values from:", customFieldsUrl);

    let customFieldValues = [];
    try {
      const customFieldsResponse = await fetchJSON(customFieldsUrl);
      customFieldValues = customFieldsResponse.dealCustomFieldData || [];
      console.log(`📋 Found ${customFieldValues.length} custom field values`);
    } catch (error) {
      console.warn("⚠️ Could not fetch custom field values:", error);
    }

    // Also get all available custom fields metadata to provide context
    const customFieldsMetaUrl = `${BASE_URL}/api/3/dealCustomFieldMeta`;
    console.log("📝 Fetching custom fields metadata from:", customFieldsMetaUrl);

    let customFieldsMeta = [];
    try {
      const customFieldsMetaResponse = await fetchJSON(customFieldsMetaUrl);
      customFieldsMeta = customFieldsMetaResponse.dealCustomFieldMeta || [];
      console.log(`📋 Found ${customFieldsMeta.length} custom field definitions`);
    } catch (error) {
      console.warn("⚠️ Could not fetch custom fields metadata:", error);
    }

    // Create a map of field IDs to field names for better readability
    const fieldIdToName = new Map();
    customFieldsMeta.forEach((field: any) => {
      fieldIdToName.set(field.id, {
        fieldLabel: field.fieldLabel,
        fieldType: field.fieldType,
        fieldOptions: field.fieldOptions || null
      });
    });

    // Enhance custom field values with metadata
    const enhancedCustomFields = customFieldValues.map((fieldValue: any) => {
      const fieldMeta = fieldIdToName.get(fieldValue.customFieldId);
      return {
        customFieldId: fieldValue.customFieldId,
        fieldValue: fieldValue.fieldValue,
        createdAt: fieldValue.cdate,
        updatedAt: fieldValue.udate,
        // Add metadata if available
        fieldLabel: fieldMeta?.fieldLabel || `Field ${fieldValue.customFieldId}`,
        fieldType: fieldMeta?.fieldType || "unknown",
        fieldOptions: fieldMeta?.fieldOptions || null
      };
    });

    // Known important field IDs based on your system
    const importantFields = {
      5: "Data Fechamento",
      25: "Estado", 
      39: "Quantidade de Pares",
      45: "Vendedor",
      47: "Designer"
    };

    // Filter for important fields
    const importantFieldValues = enhancedCustomFields.filter((field: any) => 
      Object.keys(importantFields).includes(field.customFieldId)
    );

    return NextResponse.json({
      success: true,
      message: `Custom field values retrieved for deal ${dealId}`,
      dealInfo: {
        id: dealInfo.id,
        title: dealInfo.title,
        value: dealInfo.value,
        currency: dealInfo.currency,
        status: dealInfo.status,
        stage: dealInfo.stage,
        createdAt: dealInfo.cdate,
        updatedAt: dealInfo.udate
      },
      customFieldValues: {
        total: enhancedCustomFields.length,
        important: importantFieldValues,
        all: enhancedCustomFields
      },
      fieldDefinitions: customFieldsMeta.map((field: any) => ({
        id: field.id,
        fieldLabel: field.fieldLabel,
        fieldType: field.fieldType,
        isRequired: field.isRequired,
        fieldOptions: field.fieldOptions
      })),
      importantFieldsMap: importantFields,
      debug: {
        dealUrl,
        customFieldsUrl,
        customFieldsMetaUrl,
        timestamp: new Date().toISOString(),
        environment: {
          hasBaseUrl: !!BASE_URL,
          hasApiToken: !!API_TOKEN,
          baseUrl: BASE_URL,
          apiTokenLength: API_TOKEN?.length || 0
        }
      }
    });

  } catch (error) {
    console.error("❌ Error in deal custom fields test:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Test failed",
        stack: error instanceof Error ? error.stack : null,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
