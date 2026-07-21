/**
 * Script to clear designer mockups cache
 * Run with: npx tsx scripts/clear-designer-cache.ts
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

// Load environment variables
config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  (process.env.DASHBOARD_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!
);

async function clearCache() {
  console.log("🗑️  Clearing Designer Mockups Cache...\n");

  const { error } = await supabase
    .from("designer_mockups_cache")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all records

  if (error) {
    console.error("❌ Error clearing cache:", error);
    process.exit(1);
  }

  console.log("✅ Cache cleared successfully!");
  console.log("\n📝 Next steps:");
  console.log("1. Go to the Designers page in your app");
  console.log('2. Click the "Sincronizar Dados" button');
  console.log("3. Wait for the sync to complete");
  console.log("4. The data should now appear with correct dates!");
}

clearCache().catch(console.error);

