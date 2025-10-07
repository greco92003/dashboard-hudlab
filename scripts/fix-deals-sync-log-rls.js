const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function fixDealsSyncLogRLS() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Check if deals_sync_log table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'deals_sync_log'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('📝 Creating deals_sync_log table...');
      
      // Create the table
      await client.query(`
        CREATE TABLE IF NOT EXISTS deals_sync_log (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          sync_started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          sync_completed_at TIMESTAMP WITH TIME ZONE,
          sync_status TEXT NOT NULL DEFAULT 'running' CHECK (sync_status IN ('running', 'completed', 'failed')),
          deals_processed INTEGER DEFAULT 0,
          deals_added INTEGER DEFAULT 0,
          deals_updated INTEGER DEFAULT 0,
          deals_deleted INTEGER DEFAULT 0,
          error_message TEXT,
          sync_duration_seconds INTEGER,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);
      console.log('✅ Created deals_sync_log table');
    } else {
      console.log('✅ deals_sync_log table already exists');
    }

    // Enable RLS
    await client.query(`ALTER TABLE deals_sync_log ENABLE ROW LEVEL SECURITY;`);
    console.log('✅ Enabled RLS on deals_sync_log');

    // Drop existing policies
    await client.query(`DROP POLICY IF EXISTS "service_role_complete_access" ON deals_sync_log;`);
    await client.query(`DROP POLICY IF EXISTS "authenticated_users_read" ON deals_sync_log;`);
    console.log('✅ Dropped existing RLS policies');

    // Create new policies
    await client.query(`
      CREATE POLICY "service_role_complete_access" ON deals_sync_log
      FOR ALL USING (
        auth.jwt() ->> 'role' = 'service_role' OR
        current_setting('role') = 'service_role'
      );
    `);

    await client.query(`
      CREATE POLICY "authenticated_users_read" ON deals_sync_log
      FOR SELECT USING (auth.role() = 'authenticated');
    `);

    console.log('✅ Created new RLS policies');

    // Test table access
    const testResult = await client.query('SELECT COUNT(*) FROM deals_sync_log;');
    console.log(`✅ Table access test passed. Found ${testResult.rows[0].count} records`);

    console.log('🎉 deals_sync_log RLS policies fixed successfully!');

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Run the fix
fixDealsSyncLogRLS()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
