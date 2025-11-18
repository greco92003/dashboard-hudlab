/**
 * Script to test designer mockups cache
 * Run with: npx tsx scripts/test-designer-cache.ts
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

// Load environment variables
config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testCache() {
  console.log("🔍 Testing Designer Mockups Cache...\n");

  // 1. Check total records in cache
  const { data: allRecords, error: allError } = await supabase
    .from("designer_mockups_cache")
    .select("*", { count: "exact" });

  console.log("📊 Total records in cache:", allRecords?.length || 0);
  if (allError) {
    console.error("❌ Error fetching all records:", allError);
  }

  // 2. Check records by designer
  const designers = ["Vitor", "Felipe", "Pedro"];
  for (const designer of designers) {
    const { data, error } = await supabase
      .from("designer_mockups_cache")
      .select("*")
      .eq("designer", designer);

    console.log(`\n👤 ${designer}:`, data?.length || 0, "records");
    if (data && data.length > 0) {
      console.log("   Sample record:", data[0]);
    }
  }

  // 3. Check date range
  const { data: dateRange } = await supabase
    .from("designer_mockups_cache")
    .select("atualizado_em")
    .order("atualizado_em", { ascending: true })
    .limit(1);

  const { data: dateRangeEnd } = await supabase
    .from("designer_mockups_cache")
    .select("atualizado_em")
    .order("atualizado_em", { ascending: false })
    .limit(1);

  console.log("\n📅 Date range in cache:");
  console.log("   Oldest:", dateRange?.[0]?.atualizado_em);
  console.log("   Newest:", dateRangeEnd?.[0]?.atualizado_em);

  // 4. Test RPC function
  console.log("\n🔧 Testing RPC function get_designer_mockups_stats...");
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "get_designer_mockups_stats",
    {
      p_designers: ["Vitor", "Felipe", "Pedro"],
      p_start_date: null,
      p_end_date: null,
    }
  );

  if (rpcError) {
    console.error("❌ RPC Error:", rpcError);
  } else {
    console.log("✅ RPC Result:", rpcData);
  }
}

testCache().catch(console.error);
