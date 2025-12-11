import { NextRequest, NextResponse } from "next/server";

const BASE_URL = "https://hudlab.api-us1.com";
const API_KEY = process.env.ACTIVECAMPAIGN_API_KEY;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dealId = searchParams.get("dealId");

    if (!dealId) {
      return NextResponse.json(
        { error: "dealId parameter is required" },
        { status: 400 }
      );
    }

    console.log(`🔍 Checking deal ${dealId} in ActiveCampaign...`);

    // Fetch deal from ActiveCampaign
    const dealResponse = await fetch(`${BASE_URL}/api/3/deals/${dealId}`, {
      headers: {
        "Api-Token": API_KEY!,
      },
    });

    if (!dealResponse.ok) {
      throw new Error(`Failed to fetch deal: ${dealResponse.statusText}`);
    }

    const dealData = await dealResponse.json();
    const deal = dealData.deal;

    console.log("📊 Deal data from ActiveCampaign:", {
      id: deal.id,
      title: deal.title,
      value: deal.value,
      currency: deal.currency,
      status: deal.status,
      owner: deal.owner,
    });

    // Fetch custom fields for this deal
    const customFieldsResponse = await fetch(
      `${BASE_URL}/api/3/dealCustomFieldData?filters[dealId]=${dealId}`,
      {
        headers: {
          "Api-Token": API_KEY!,
        },
      }
    );

    if (!customFieldsResponse.ok) {
      throw new Error(
        `Failed to fetch custom fields: ${customFieldsResponse.statusText}`
      );
    }

    const customFieldsData = await customFieldsResponse.json();

    // Map custom fields
    const customFields: Record<string, any> = {};
    if (customFieldsData.dealCustomFieldData) {
      customFieldsData.dealCustomFieldData.forEach((field: any) => {
        customFields[`field_${field.customFieldId}`] = {
          id: field.customFieldId,
          value: field.fieldValue,
        };
      });
    }

    return NextResponse.json({
      success: true,
      deal: {
        id: deal.id,
        title: deal.title,
        value: deal.value,
        valueInReais: parseFloat(deal.value || "0") / 100,
        currency: deal.currency,
        status: deal.status,
        owner: deal.owner,
        contact: deal.contact,
        organization: deal.organization,
        stage: deal.stage,
        created: deal.cdate,
        updated: deal.mdate,
      },
      customFields: customFields,
      rawDeal: deal,
    });
  } catch (error) {
    console.error("Error checking deal:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

