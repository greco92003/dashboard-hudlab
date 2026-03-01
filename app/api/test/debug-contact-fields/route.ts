import { NextRequest, NextResponse } from "next/server";

const BASE_URL = process.env.NEXT_PUBLIC_AC_BASE_URL;
const API_TOKEN = process.env.AC_API_TOKEN;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const contactId = searchParams.get("contactId");

  if (!contactId) {
    return NextResponse.json(
      { error: "contactId query parameter is required" },
      { status: 400 },
    );
  }

  try {
    console.log(`🔍 Fetching contact fields for contact ID: ${contactId}`);

    // Fetch contact field values
    const res = await fetch(
      `${BASE_URL}/api/3/contacts/${contactId}/fieldValues`,
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

    // Filter for fields 7 and 50
    const fieldValues = data.fieldValues || [];
    const fields7and50 = fieldValues.filter((fv: any) => {
      const fieldId = parseInt(fv.field);
      return fieldId === 7 || fieldId === 50;
    });

    return NextResponse.json({
      contactId,
      totalFieldValues: fieldValues.length,
      fields7and50,
      allFieldValues: fieldValues,
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

