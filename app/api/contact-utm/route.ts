import { NextRequest, NextResponse } from "next/server";

// Environment variables
const BASE_URL = process.env.NEXT_PUBLIC_AC_BASE_URL;
const API_TOKEN = process.env.AC_API_TOKEN;

const headers = {
  "Api-Token": API_TOKEN || "",
  "Content-Type": "application/json",
};

// Fetch function with timeout
async function fetchJSON(url: string, timeout = 10000) {
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
    if (error instanceof Error && error.name === "AbortError") {
      console.error("Request timeout:", url);
      throw new Error(`Request timeout: ${url}`);
    }
    console.error("Fetch error:", error);
    throw error;
  }
}

// GET endpoint to fetch UTM data for a specific contact
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contactId = searchParams.get("contactId");

    if (!contactId) {
      return NextResponse.json(
        { error: "contactId parameter is required" },
        { status: 400 }
      );
    }

    console.log(`🎯 Fetching UTM data for contact ID: ${contactId}`);

    // Validate environment variables
    if (!BASE_URL || !API_TOKEN) {
      return NextResponse.json(
        { error: "ActiveCampaign credentials not configured" },
        { status: 500 }
      );
    }

    // Method 1: Try to get field values using the fieldValues endpoint
    console.log("🔍 Method 1: Trying fieldValues endpoint...");
    const fieldValuesUrl = new URL(`${BASE_URL}/api/3/fieldValues`);
    fieldValuesUrl.searchParams.set("filters[contact]", contactId);

    console.log(`📡 Requesting: ${fieldValuesUrl.toString()}`);

    let utmSource = null;
    let utmMedium = null;
    const allFields: any[] = [];
    let method1Success = false;

    try {
      const response = await fetchJSON(fieldValuesUrl.toString(), 15000);
      const fieldValues = response.fieldValues || [];

      console.log(
        `📦 Method 1: Found ${fieldValues.length} field values for contact ${contactId}`
      );

      fieldValues.forEach((fieldValue: any) => {
        const fieldId = parseInt(fieldValue.field);

        allFields.push({
          method: "fieldValues",
          fieldId: fieldId,
          value: fieldValue.value,
          createdAt: fieldValue.cdate,
          updatedAt: fieldValue.udate,
        });

        // Check for our target UTM fields
        if (fieldId === 2) {
          utmSource = fieldValue.value;
          console.log(`📍 Found UTM Source (Method 1): ${fieldValue.value}`);
        } else if (fieldId === 3) {
          utmMedium = fieldValue.value;
          console.log(`📍 Found UTM Medium (Method 1): ${fieldValue.value}`);
        }
      });

      method1Success = true;
    } catch (error) {
      console.log("⚠️ Method 1 failed, trying Method 2...");
    }

    // Method 2: Try to get contact details with field values using the contact endpoint
    if (!method1Success || (!utmSource && !utmMedium)) {
      console.log("🔍 Method 2: Trying contact endpoint with field values...");

      try {
        const contactUrl = new URL(`${BASE_URL}/api/3/contacts/${contactId}`);
        console.log(`📡 Requesting contact details: ${contactUrl.toString()}`);

        const contactResponse = await fetchJSON(contactUrl.toString(), 15000);
        const contact = contactResponse.contact;

        if (contact && contact.fieldValues) {
          console.log(
            `📦 Method 2: Found ${contact.fieldValues.length} field values in contact data`
          );

          contact.fieldValues.forEach((fieldValue: any) => {
            const fieldId = parseInt(fieldValue.field);

            allFields.push({
              method: "contact",
              fieldId: fieldId,
              value: fieldValue.value,
              createdAt: fieldValue.cdate,
              updatedAt: fieldValue.udate,
            });

            // Check for our target UTM fields
            if (fieldId === 2) {
              utmSource = fieldValue.value;
              console.log(
                `📍 Found UTM Source (Method 2): ${fieldValue.value}`
              );
            } else if (fieldId === 3) {
              utmMedium = fieldValue.value;
              console.log(
                `📍 Found UTM Medium (Method 2): ${fieldValue.value}`
              );
            }
          });
        }
      } catch (error) {
        console.log("⚠️ Method 2 also failed");
      }
    }

    const result = {
      contactId: contactId,
      utmData: {
        utmSource: utmSource, // Field ID 2
        utmMedium: utmMedium, // Field ID 3
      },
      allCustomFields: allFields,
      totalFields: allFields.length,
    };

    console.log(`✅ UTM data retrieved for contact ${contactId}:`);
    console.log(`   UTM Source: ${utmSource || "Not found"}`);
    console.log(`   UTM Medium: ${utmMedium || "Not found"}`);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching contact UTM data:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch contact UTM data",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
