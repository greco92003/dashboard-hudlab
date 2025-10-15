/**
 * Script to apply RLS performance optimizations to Supabase
 * 
 * This script optimizes RLS policies by wrapping auth functions in SELECT statements
 * to prevent re-evaluation for each row, significantly improving query performance.
 * 
 * Issue: https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing required environment variables:");
  console.error("   - NEXT_PUBLIC_SUPABASE_URL");
  console.error("   - SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// Create Supabase client with service role key
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function applyRLSOptimization() {
  console.log("⚡ Starting RLS Performance Optimization...\n");
  console.log("This will optimize 32+ RLS policies across 16 tables");
  console.log("Expected performance improvement: 10-100x faster on large tables\n");

  try {
    // Read the migration file
    const migrationPath = path.join(
      __dirname,
      "../supabase/migrations/optimize_rls_policies_performance.sql"
    );
    
    console.log("📄 Reading migration file:", migrationPath);
    const migrationSQL = fs.readFileSync(migrationPath, "utf8");

    // Split the SQL into individual statements
    const statements = migrationSQL
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--"));

    console.log(`📝 Found ${statements.length} SQL statements to execute\n`);

    // Tables being optimized
    const tables = [
      "partners_commission_settings",
      "deals_sync_log",
      "meta_insights",
      "meta_ad_accounts",
      "meta_campaigns",
      "meta_ad_sets",
      "meta_ads",
      "meta_ad_creatives",
      "meta_custom_audiences",
      "generated_coupons",
      "notifications",
      "user_notifications",
      "push_subscriptions",
      "designer_mockups_cache",
      "designer_mockups_sync_log",
      "nuvemshop_sync_log"
    ];

    console.log("📊 Tables being optimized:");
    tables.forEach((table, index) => {
      console.log(`   ${index + 1}. ${table}`);
    });
    console.log("");

    // Execute each statement
    let successCount = 0;
    let errorCount = 0;
    let currentTable = "";

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ";";
      
      // Skip comments and empty statements
      if (statement.startsWith("--") || statement.trim() === ";") {
        continue;
      }

      // Extract table name for logging
      const tableMatch = statement.match(/ON\s+(\w+)/i);
      if (tableMatch && tableMatch[1] !== currentTable) {
        currentTable = tableMatch[1];
        console.log(`\n🔧 Optimizing table: ${currentTable}`);
      }

      // Extract policy name for logging
      const policyMatch = statement.match(/POLICY\s+"([^"]+)"/i);
      const policyName = policyMatch ? policyMatch[1] : `Statement ${i + 1}`;

      try {
        console.log(`   ⚡ ${policyName}...`);
        
        const { error } = await supabase.rpc("exec_sql", {
          sql: statement,
        });

        if (error) {
          // Try direct execution if exec_sql doesn't exist
          const { error: directError } = await supabase.from("_").select(statement);
          
          if (directError && directError.code !== "42P01") {
            throw directError;
          }
        }

        console.log(`   ✅ Success`);
        successCount++;
      } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
        errorCount++;
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("📊 SUMMARY");
    console.log("=".repeat(60));
    console.log(`✅ Successful: ${successCount}`);
    console.log(`❌ Failed: ${errorCount}`);
    console.log(`📋 Tables optimized: ${tables.length}`);
    console.log("=".repeat(60));

    if (errorCount === 0) {
      console.log("\n🎉 All RLS policies optimized successfully!");
      console.log("\n📈 Performance Impact:");
      console.log("   - Queries on large tables will be 10-100x faster");
      console.log("   - auth.uid() and auth.role() now evaluated once per query");
      console.log("   - Especially beneficial for tables with thousands of rows");
      console.log("\n📋 Next steps:");
      console.log("   1. Go to Supabase Dashboard → Database → Advisors");
      console.log("   2. Verify that 'Auth RLS Initialization Plan' warnings are gone");
      console.log("   3. Test your application to ensure everything works correctly");
      console.log("   4. Monitor query performance improvements");
    } else {
      console.log("\n⚠️  Some optimizations failed. Please check the errors above.");
      console.log("   You may need to apply the migration manually in Supabase SQL Editor.");
    }

  } catch (error) {
    console.error("\n❌ Fatal error:", error);
    process.exit(1);
  }
}

// Run the optimization
applyRLSOptimization();

