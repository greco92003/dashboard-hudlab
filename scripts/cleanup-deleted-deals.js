require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const BASE_URL = process.env.NEXT_PUBLIC_AC_BASE_URL;
const API_TOKEN = process.env.AC_API_TOKEN;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fetchAllDealsFromAC() {
  console.log("📥 Fetching all deals from ActiveCampaign...");
  
  const allDeals = new Set();
  let offset = 0;
  const limit = 100;
  let hasMore = true;
  
  while (hasMore) {
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
      hasMore = false;
      break;
    }
    
    data.deals.forEach(deal => allDeals.add(deal.id.toString()));
    
    offset += limit;
    console.log(`   Fetched ${allDeals.size} deals...`);
    
    // Safety limit
    if (offset >= 50000) {
      console.log("   Reached safety limit of 50,000 deals");
      break;
    }
  }
  
  console.log(`✅ Total deals in ActiveCampaign: ${allDeals.size}`);
  return allDeals;
}

async function getDealsFromCache() {
  console.log("\n📊 Fetching deals from Supabase cache...");
  
  const { data, error } = await supabase
    .from("deals_cache")
    .select("deal_id, title, value, status, vendedor");
  
  if (error) {
    throw new Error(`Failed to fetch from cache: ${error.message}`);
  }
  
  console.log(`✅ Total deals in cache: ${data.length}`);
  return data;
}

async function main() {
  console.log("🚀 Starting cleanup of deleted deals...\n");
  console.log("=".repeat(60));
  
  try {
    // Fetch all deals from ActiveCampaign
    const acDeals = await fetchAllDealsFromAC();
    
    // Fetch all deals from cache
    const cacheDeals = await getDealsFromCache();
    
    // Find deals in cache that don't exist in ActiveCampaign
    const orphanedDeals = cacheDeals.filter(
      deal => !acDeals.has(deal.deal_id)
    );
    
    console.log("\n" + "=".repeat(60));
    console.log(`\n🔍 Found ${orphanedDeals.length} orphaned deals in cache`);
    
    if (orphanedDeals.length === 0) {
      console.log("✅ No cleanup needed!");
      return;
    }
    
    // Show orphaned deals
    console.log("\n📋 Orphaned deals (will be deleted):");
    orphanedDeals.forEach((deal, index) => {
      console.log(`\n${index + 1}. Deal ID: ${deal.deal_id}`);
      console.log(`   Title: ${deal.title}`);
      console.log(`   Value: R$ ${(parseFloat(deal.value || "0") / 100).toFixed(2)}`);
      console.log(`   Status: ${deal.status} (0=Open, 1=Won, 2=Lost)`);
      console.log(`   Vendedor: ${deal.vendedor || "N/A"}`);
    });
    
    console.log("\n" + "=".repeat(60));
    console.log(`\n⚠️  Ready to delete ${orphanedDeals.length} orphaned deals from cache`);
    console.log("   Run with --execute flag to perform deletion");
    
    // Check if --execute flag is present
    if (process.argv.includes("--execute")) {
      console.log("\n🗑️  Deleting orphaned deals...");
      
      const dealIds = orphanedDeals.map(d => d.deal_id);
      
      const { error } = await supabase
        .from("deals_cache")
        .delete()
        .in("deal_id", dealIds);
      
      if (error) {
        throw new Error(`Failed to delete deals: ${error.message}`);
      }
      
      console.log(`✅ Successfully deleted ${orphanedDeals.length} orphaned deals!`);
    } else {
      console.log("\n💡 To execute deletion, run:");
      console.log("   node scripts/cleanup-deleted-deals.js --execute");
    }
    
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  }
}

main();

