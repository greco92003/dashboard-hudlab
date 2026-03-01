import { NextRequest, NextResponse } from "next/server";

const BASE_URL = process.env.NEXT_PUBLIC_AC_BASE_URL;
const API_TOKEN = process.env.AC_API_TOKEN;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dealId = searchParams.get("dealId");

  if (!dealId) {
    return NextResponse.json(
      { error: "dealId query parameter is required" },
      { status: 400 },
    );
  }

  try {
    console.log(`🔍 Fetching deal custom fields for deal ID: ${dealId}`);

    // Fetch deal custom fields
    const res = await fetch(
      `${BASE_URL}/api/3/dealCustomFieldData?deal=${dealId}&limit=100`,
      {
        headers: {
          "Api-Token": API_TOKEN!,
          "Content-Type": "application/json",
        },
      },
    );

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`❌ AC API error: ${res.status} - ${errorText}`);
      return NextResponse.json(
        {
          error: `ActiveCampaign API error: ${res.status}`,
          details: errorText,
        },
        { status: res.status },
      );
    }

    const data = await res.json();
    console.log(`✅ Response:`, JSON.stringify(data, null, 2));

    // Filter for target fields
    const TARGET_CUSTOM_FIELD_IDS = [5, 25, 39, 45, 47, 49, 50];
    const dealCustomFieldData = data.dealCustomFieldData || [];
    const targetFields = dealCustomFieldData.filter((item: any) => {
      const fieldId = parseInt(item.customFieldId);
      return TARGET_CUSTOM_FIELD_IDS.includes(fieldId);
    });

    return NextResponse.json({
      dealId,
      totalCustomFields: dealCustomFieldData.length,
      targetFields,
      allCustomFields: dealCustomFieldData,
      rawResponse: data,
    });
  } catch (error: any) {
    console.error(`❌ Error:`, error);
    return NextResponse.json(
      { error: error.message, stack: error.stack },
      { status: 500 },
    );
  }
}

