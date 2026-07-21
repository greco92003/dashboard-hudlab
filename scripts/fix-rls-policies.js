#!/usr/bin/env node

/**
 * Script to fix RLS policies for deals_processed_tracking table
 * This resolves the "new row violates row-level security policy" error
 */

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

// Load environment variables
require("dotenv").config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = (process.env.DASHBOARD_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing Supabase configuration in .env.local");
  console.error(
    "Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
  );
  process.exit(1);
}

// Create Supabase client with service role key
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function fixRLSPolicies() {
  console.log(
    "🔧 Starting RLS policies fix for deals_processed_tracking table..."
  );

  try {
    // Read the migration file
    const migrationPath = path.join(
      __dirname,
      "../supabase/migrations/fix_tracking_table_rls.sql"
    );
    const migrationSQL = fs.readFileSync(migrationPath, "utf8");

    console.log("📄 Loaded migration SQL from:", migrationPath);

    // Execute the migration
    console.log("⚡ Executing RLS policies fix...");
    const { data, error } = await supabase.rpc("exec_sql", {
      sql: migrationSQL,
    });

    if (error) {
      // If exec_sql doesn't exist, try direct SQL execution
      console.log("🔄 Trying direct SQL execution...");

      // Split the SQL into individual statements
      const statements = migrationSQL
        .split(";")
        .map((stmt) => stmt.trim())
        .filter((stmt) => stmt.length > 0 && !stmt.startsWith("--"));

      for (const statement of statements) {
        if (statement.trim()) {
          console.log(`📝 Executing: ${statement.substring(0, 50)}...`);
          const { error: stmtError } = await supabase.rpc("exec_sql", {
            sql: statement,
          });

          if (stmtError) {
            console.error(`❌ Error executing statement: ${stmtError.message}`);
            throw stmtError;
          }
        }
      }
    }

    console.log("✅ RLS policies fix completed successfully!");

    // Test the fix by trying to select from the table
    console.log("🧪 Testing table access...");
    const { data: testData, error: testError } = await supabase
      .from("deals_processed_tracking")
      .select("count(*)")
      .limit(1);

    if (testError) {
      console.warn(
        "⚠️  Warning: Could not test table access:",
        testError.message
      );
    } else {
      console.log("✅ Table access test successful!");
    }

    console.log("\n🎉 RLS policies have been fixed!");
    console.log("You can now run your sync operation again.");
  } catch (error) {
    console.error("❌ Error fixing RLS policies:", error.message);
    console.error("Full error:", error);
    process.exit(1);
  }
}

// Alternative approach using PostgreSQL client
async function fixRLSPoliciesDirectSQL() {
  console.log("🔧 Starting RLS policies fix using PostgreSQL client...");

  const { Client } = require("pg");

  // Parse the DATABASE_URL
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL not found in environment variables");
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    await client.connect();
    console.log("✅ Connected to PostgreSQL database");

    // Execute each SQL statement individually
    const statements = [
      'DROP POLICY IF EXISTS "service_role_full_access" ON deals_processed_tracking',
      'DROP POLICY IF EXISTS "authenticated_read_only" ON deals_processed_tracking',
      'DROP POLICY IF EXISTS "api_service_operations" ON deals_processed_tracking',
      'DROP POLICY IF EXISTS "Allow service role to manage deals tracking" ON deals_processed_tracking',
      'DROP POLICY IF EXISTS "Allow authenticated users to read deals tracking" ON deals_processed_tracking',
      'DROP POLICY IF EXISTS "service_role_complete_access" ON deals_processed_tracking',
      'DROP POLICY IF EXISTS "authenticated_users_read" ON deals_processed_tracking',
      "ALTER TABLE deals_processed_tracking DISABLE ROW LEVEL SECURITY",
      "ALTER TABLE deals_processed_tracking ENABLE ROW LEVEL SECURITY",
      `CREATE POLICY "service_role_complete_access" ON deals_processed_tracking
       FOR ALL TO service_role
       USING (true)
       WITH CHECK (true)`,
      `CREATE POLICY "authenticated_users_read" ON deals_processed_tracking
       FOR SELECT TO authenticated
       USING (true)`,
    ];

    for (const [index, statement] of statements.entries()) {
      console.log(
        `📝 Executing statement ${index + 1}/${statements.length}...`
      );
      console.log(`   ${statement.substring(0, 60)}...`);

      try {
        await client.query(statement);
        console.log(`   ✅ Statement ${index + 1} executed successfully`);
      } catch (error) {
        if (error.message.includes("does not exist")) {
          console.log(
            `   ⚠️  Statement ${index + 1} skipped (object doesn't exist)`
          );
        } else {
          console.error(
            `   ❌ Error executing statement ${index + 1}:`,
            error.message
          );
          throw error;
        }
      }
    }

    console.log("✅ All RLS policy statements processed successfully!");

    // Test the fix by checking if we can query the table
    console.log("🧪 Testing table access...");
    const result = await client.query(
      "SELECT COUNT(*) FROM deals_processed_tracking"
    );
    console.log(
      `✅ Table access test successful! Found ${result.rows[0].count} records`
    );

    console.log("\n🎉 RLS policies have been fixed!");
    console.log("You can now run your sync operation again.");
  } catch (error) {
    console.error("❌ Error fixing RLS policies:", error.message);
    throw error;
  } finally {
    await client.end();
    console.log("🔌 Database connection closed");
  }
}

// Run the fix
if (require.main === module) {
  fixRLSPoliciesDirectSQL().catch(console.error);
}

module.exports = { fixRLSPolicies, fixRLSPoliciesDirectSQL };
