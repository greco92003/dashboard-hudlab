require("dotenv").config({ path: ".env.local" });

const BASE_URL = "https://hudlab.api-us1.com";
const API_KEY = process.env.ACTIVECAMPAIGN_API_KEY;

async function checkDeal(dealId) {
  try {
    console.log(`\n🔍 Checking deal ${dealId} in ActiveCampaign...`);

    // Fetch deal from ActiveCampaign
    const dealResponse = await fetch(`${BASE_URL}/api/3/deals/${dealId}`, {
      headers: {
        "Api-Token": API_KEY,
      },
    });

    if (!dealResponse.ok) {
      throw new Error(`Failed to fetch deal: ${dealResponse.statusText}`);
    }

    const dealData = await dealResponse.json();
    const deal = dealData.deal;

    console.log("📊 Deal data from ActiveCampaign:");
    console.log(`   ID: ${deal.id}`);
    console.log(`   Title: ${deal.title}`);
    console.log(`   Value (raw): ${deal.value}`);
    console.log(
      `   Value (in reais): R$ ${(parseFloat(deal.value || "0") / 100).toFixed(
        2
      )}`
    );
    console.log(`   Currency: ${deal.currency}`);
    console.log(`   Status: ${deal.status}`);
    console.log(`   Owner: ${deal.owner}`);
    console.log(`   Created: ${deal.cdate}`);
    console.log(`   Updated: ${deal.mdate}`);

    // Fetch custom fields for this deal
    const customFieldsResponse = await fetch(
      `${BASE_URL}/api/3/dealCustomFieldData?filters[dealId]=${dealId}`,
      {
        headers: {
          "Api-Token": API_KEY,
        },
      }
    );

    if (!customFieldsResponse.ok) {
      throw new Error(
        `Failed to fetch custom fields: ${customFieldsResponse.statusText}`
      );
    }

    const customFieldsData = await customFieldsResponse.json();

    console.log("\n📋 Custom Fields:");
    if (customFieldsData.dealCustomFieldData) {
      customFieldsData.dealCustomFieldData.forEach((field) => {
        console.log(`   Field ${field.customFieldId}: ${field.fieldValue}`);
      });
    }

    return {
      deal,
      customFields: customFieldsData.dealCustomFieldData || [],
    };
  } catch (error) {
    console.error(`❌ Error checking deal ${dealId}:`, error.message);
    return null;
  }
}

async function main() {
  console.log("🚀 Starting zero-value deals diagnostic...\n");
  console.log("=".repeat(60));

  // Check specific deals mentioned by user
  const dealsToCheck = [
    "14790", // Alisson - OS GURI DA 24 - Should be R$ 2,443.68
    "26028", // Alisson lucas Prates - Showing as zero in dashboard
    "14818", // Tamires - HUFF LIFE - Schay (zero value)
    "14798", // Bruno - Fáb. de Montros - Schay (zero value)
  ];

  for (const dealId of dealsToCheck) {
    await checkDeal(dealId);
    console.log("=".repeat(60));
  }

  console.log("\n✅ Diagnostic complete!");
}

main().catch(console.error);
