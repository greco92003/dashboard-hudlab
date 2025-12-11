require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSyncStatus() {
  console.log("🔍 Checking sync status...\n");
  
  // Get last sync log
  const { data: lastSync, error } = await supabase
    .from("deals_sync_log")
    .select("*")
    .order("sync_started_at", { ascending: false })
    .limit(1)
    .single();
  
  if (error) {
    console.error("Error fetching sync log:", error.message);
    return;
  }
  
  if (lastSync) {
    console.log("📊 Last Sync:");
    console.log(`   Status: ${lastSync.sync_status}`);
    console.log(`   Started: ${lastSync.sync_started_at}`);
    console.log(`   Completed: ${lastSync.sync_completed_at || "In progress..."}`);
    console.log(`   Deals Processed: ${lastSync.deals_processed || 0}`);
    console.log(`   Errors: ${lastSync.error_count || 0}`);
    if (lastSync.error_message) {
      console.log(`   Error Message: ${lastSync.error_message}`);
    }
  }
  
  // Check deal 14790
  console.log("\n🔍 Checking deal 14790...");
  const { data: deal14790 } = await supabase
    .from("deals_cache")
    .select("deal_id, title, value, status, closing_date, vendedor")
    .eq("deal_id", "14790")
    .single();
  
  if (deal14790) {
    console.log("✅ Deal 14790 found in cache:");
    console.log(`   Title: ${deal14790.title}`);
    console.log(`   Value: R$ ${(parseFloat(deal14790.value || "0") / 100).toFixed(2)}`);
    console.log(`   Status: ${deal14790.status} (0=Open, 1=Won, 2=Lost)`);
    console.log(`   Closing Date: ${deal14790.closing_date || "NOT SET"}`);
    console.log(`   Vendedor: ${deal14790.vendedor}`);
  } else {
    console.log("❌ Deal 14790 NOT found in cache");
  }
  
  // Check deal 26028
  console.log("\n🔍 Checking deal 26028...");
  const { data: deal26028 } = await supabase
    .from("deals_cache")
    .select("deal_id, title, value, status, closing_date")
    .eq("deal_id", "26028")
    .single();
  
  if (deal26028) {
    console.log("⚠️  Deal 26028 still exists in cache (should be deleted):");
    console.log(`   Title: ${deal26028.title}`);
    console.log(`   Value: R$ ${(parseFloat(deal26028.value || "0") / 100).toFixed(2)}`);
    console.log(`   Status: ${deal26028.status}`);
    console.log(`   Closing Date: ${deal26028.closing_date}`);
  } else {
    console.log("✅ Deal 26028 NOT in cache (correctly deleted)");
  }
  
  // Count deals with zero value and won status
  console.log("\n📊 Deals with zero value and won status:");
  const { data: zeroValueDeals, count } = await supabase
    .from("deals_cache")
    .select("deal_id, title", { count: "exact" })
    .eq("value", 0)
    .eq("status", "1");
  
  console.log(`   Total: ${count || 0} deals`);
  if (zeroValueDeals && zeroValueDeals.length > 0) {
    zeroValueDeals.forEach(deal => {
      console.log(`   - Deal ${deal.deal_id}: ${deal.title}`);
    });
  }
}

checkSyncStatus();

