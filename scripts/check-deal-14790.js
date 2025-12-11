require("dotenv").config({ path: ".env.local" });

const BASE_URL = process.env.NEXT_PUBLIC_AC_BASE_URL;
const API_TOKEN = process.env.AC_API_TOKEN;

async function fetchDeal(dealId) {
  console.log(`🔍 Fetching deal ${dealId} from ActiveCampaign...\n`);
  
  // Search through paginated results
  let offset = 0;
  const limit = 100;
  
  while (offset < 10000) {
    const url = `${BASE_URL}/api/3/deals?limit=${limit}&offset=${offset}`;
    
    const response = await fetch(url, {
      headers: {
        "Api-Token": API_TOKEN,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch deals: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.deals || data.deals.length === 0) {
      break;
    }
    
    const deal = data.deals.find(d => d.id === dealId);
    
    if (deal) {
      console.log("✅ FOUND Deal:", deal.id);
      console.log("   Title:", deal.title);
      console.log("   Value:", deal.value, `(R$ ${(parseFloat(deal.value || "0") / 100).toFixed(2)})`);
      console.log("   Status:", deal.status, "(0=Open, 1=Won, 2=Lost)");
      console.log("   Contact:", deal.contact);
      console.log("   Owner:", deal.owner);
      console.log("   Created:", deal.cdate);
      console.log("   Updated:", deal.mdate);
      
      // Fetch deal field values
      console.log("\n📋 Fetching custom field values...");
      const fieldValuesUrl = `${BASE_URL}/api/3/deals/${dealId}/dealCustomFieldData`;
      const fieldResponse = await fetch(fieldValuesUrl, {
        headers: {
          "Api-Token": API_TOKEN,
        },
      });
      
      if (fieldResponse.ok) {
        const fieldData = await fieldResponse.json();
        console.log("\n✅ Custom Fields:");
        if (fieldData.dealCustomFieldData && fieldData.dealCustomFieldData.length > 0) {
          fieldData.dealCustomFieldData.forEach(field => {
            console.log(`   Field ${field.customFieldId}: ${field.fieldValue}`);
          });
          
          // Check for field 5 (closing_date)
          const closingDateField = fieldData.dealCustomFieldData.find(f => f.customFieldId === "5");
          if (closingDateField) {
            console.log(`\n✅ Closing Date (Field 5): ${closingDateField.fieldValue}`);
          } else {
            console.log("\n❌ Closing Date (Field 5) NOT FOUND");
          }
        } else {
          console.log("   No custom fields found");
        }
      } else {
        console.log("   Failed to fetch custom fields:", fieldResponse.statusText);
      }
      
      return deal;
    }
    
    offset += limit;
    if (offset % 500 === 0) {
      console.log(`   Searched ${offset} deals...`);
    }
  }
  
  console.log(`❌ Deal ${dealId} NOT FOUND`);
  return null;
}

async function main() {
  try {
    await fetchDeal("14790");
  } catch (error) {
    console.error("Error:", error.message);
  }
}

main();

