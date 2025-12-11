require("dotenv").config({ path: ".env.local" });

const BASE_URL = process.env.NEXT_PUBLIC_AC_BASE_URL;
const API_TOKEN = process.env.AC_API_TOKEN;

// Deals with zero value and status "won" from the database
const zeroValueDeals = [
  "10725", "10399", "8494", "12460", "8700", "9088", 
  "4202", "9295", "8739", "11080", "10682", "10713", 
  "14818", "10029", "10915", "14798"
];

async function fetchAllDeals() {
  console.log("📥 Fetching all deals from ActiveCampaign...");
  
  const allDeals = new Map();
  let offset = 0;
  const limit = 100;
  let hasMore = true;
  let requestCount = 0;
  
  while (hasMore && requestCount < 100) { // Limit to 100 requests (10,000 deals)
    const url = `${BASE_URL}/api/3/deals?limit=${limit}&offset=${offset}`;
    
    try {
      const response = await fetch(url, {
        headers: {
          "Api-Token": API_TOKEN,
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        console.error(`Failed to fetch deals at offset ${offset}: ${response.statusText}`);
        break;
      }

      const data = await response.json();
      
      if (!data.deals || data.deals.length === 0) {
        hasMore = false;
        break;
      }
      
      data.deals.forEach(deal => {
        allDeals.set(deal.id.toString(), {
          id: deal.id,
          title: deal.title,
          value: deal.value,
          status: deal.status,
        });
      });
      
      offset += limit;
      requestCount++;
      console.log(`   Fetched ${allDeals.size} deals (${requestCount} requests)...`);
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error) {
      console.error(`Error fetching deals at offset ${offset}:`, error.message);
      break;
    }
  }
  
  console.log(`✅ Total deals fetched: ${allDeals.size}`);
  return allDeals;
}

async function main() {
  console.log("🚀 Verifying zero-value deals...\n");
  console.log("=".repeat(60));
  
  try {
    const allDeals = await fetchAllDeals();
    
    console.log("\n" + "=".repeat(60));
    console.log("\n🔍 Checking zero-value deals:\n");
    
    const found = [];
    const notFound = [];
    const foundWithValue = [];
    
    for (const dealId of zeroValueDeals) {
      const deal = allDeals.get(dealId);
      
      if (deal) {
        const value = parseFloat(deal.value || "0");
        if (value === 0) {
          found.push(dealId);
          console.log(`✅ Deal ${dealId}: "${deal.title}" - Value: R$ 0.00 (Status: ${deal.status})`);
        } else {
          foundWithValue.push({ id: dealId, ...deal });
          console.log(`⚠️  Deal ${dealId}: "${deal.title}" - Value: R$ ${(value / 100).toFixed(2)} (Status: ${deal.status}) - HAS VALUE!`);
        }
      } else {
        notFound.push(dealId);
        console.log(`❌ Deal ${dealId}: NOT FOUND in ActiveCampaign`);
      }
    }
    
    console.log("\n" + "=".repeat(60));
    console.log("\n📊 SUMMARY:");
    console.log(`✅ Found with zero value: ${found.length} deals`);
    console.log(`⚠️  Found with actual value: ${foundWithValue.length} deals (NEED UPDATE!)`);
    console.log(`❌ Not found (orphaned): ${notFound.length} deals`);
    
    if (foundWithValue.length > 0) {
      console.log("\n⚠️  DEALS THAT NEED VALUE UPDATE:");
      foundWithValue.forEach(deal => {
        const value = parseFloat(deal.value || "0");
        console.log(`   Deal ${deal.id}: R$ ${(value / 100).toFixed(2)} - "${deal.title}"`);
      });
    }
    
    if (notFound.length > 0) {
      console.log("\n🗑️  DEALS TO DELETE FROM CACHE:");
      console.log(`   ${notFound.join(", ")}`);
    }
    
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  }
}

main();

