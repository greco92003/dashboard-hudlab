require("dotenv").config({ path: ".env.local" });

const BASE_URL = process.env.NEXT_PUBLIC_AC_BASE_URL;
const API_TOKEN = process.env.AC_API_TOKEN;

async function checkDeal14422() {
  try {
    console.log("🔍 Checking deal 14422 in ActiveCampaign...\n");

    // Fetch deal custom fields
    const response = await fetch(
      `${BASE_URL}/api/3/dealCustomFieldData?filters[dealId]=14422`,
      {
        headers: {
          "Api-Token": API_TOKEN,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`);
    }

    const data = await response.json();

    console.log("📋 All Custom Fields for Deal 14422:");
    if (data.dealCustomFieldData && data.dealCustomFieldData.length > 0) {
      data.dealCustomFieldData.forEach((field) => {
        console.log(
          `   Field ${field.customFieldId}: "${field.fieldValue}" (updated: ${field.udate})`
        );
      });

      // Find field 39 (quantidade-de-pares)
      const field39 = data.dealCustomFieldData.find(
        (f) => f.customFieldId === "39"
      );
      if (field39) {
        console.log("\n✅ Quantidade de Pares (Field 39):", field39.fieldValue);
        console.log("   Last updated:", field39.udate);
      } else {
        console.log("\n❌ Field 39 (Quantidade de Pares) NOT FOUND");
      }
    } else {
      console.log("   No custom fields found");
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

checkDeal14422();

