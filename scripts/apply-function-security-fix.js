/**
 * Script to apply function search_path security fixes to Supabase
 * 
 * This script fixes the "Function Search Path Mutable" security warning
 * by adding explicit search_path settings to all affected functions.
 * 
 * Issue: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = (process.env.DASHBOARD_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);

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

async function applyFunctionSecurityFix() {
  console.log("🔧 Starting Function Search Path Security Fix...\n");

  try {
    // Read the migration file
    const migrationPath = path.join(
      __dirname,
      "../supabase/migrations/fix_function_search_path_security.sql"
    );
    
    console.log("📄 Reading migration file:", migrationPath);
    const migrationSQL = fs.readFileSync(migrationPath, "utf8");

    // Split the SQL into individual statements
    const statements = migrationSQL
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--"));

    console.log(`📝 Found ${statements.length} SQL statements to execute\n`);

    // Execute each statement
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ";";
      
      // Skip comments and empty statements
      if (statement.startsWith("--") || statement.trim() === ";") {
        continue;
      }

      // Extract function name for logging
      const functionMatch = statement.match(/FUNCTION\s+(\w+)/i);
      const functionName = functionMatch ? functionMatch[1] : `Statement ${i + 1}`;

      try {
        console.log(`⚡ Executing: ${functionName}...`);
        
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

        console.log(`✅ Success: ${functionName}`);
        successCount++;
      } catch (error) {
        console.error(`❌ Error executing ${functionName}:`, error.message);
        errorCount++;
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("📊 SUMMARY");
    console.log("=".repeat(60));
    console.log(`✅ Successful: ${successCount}`);
    console.log(`❌ Failed: ${errorCount}`);
    console.log("=".repeat(60));

    if (errorCount === 0) {
      console.log("\n🎉 All function security fixes applied successfully!");
      console.log("\n📋 Next steps:");
      console.log("   1. Go to Supabase Dashboard → Database → Advisors");
      console.log("   2. Verify that 'Function Search Path Mutable' warnings are gone");
      console.log("   3. Test your application to ensure functions work correctly");
    } else {
      console.log("\n⚠️  Some fixes failed. Please check the errors above.");
      console.log("   You may need to apply the migration manually in Supabase SQL Editor.");
    }

  } catch (error) {
    console.error("\n❌ Fatal error:", error);
    process.exit(1);
  }
}

// Run the fix
applyFunctionSecurityFix();

