-- Fix RLS policies for deals_processed_tracking table
-- This script resolves the "new row violates row-level security policy" error

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "service_role_full_access" ON deals_processed_tracking;
DROP POLICY IF EXISTS "authenticated_read_only" ON deals_processed_tracking;
DROP POLICY IF EXISTS "api_service_operations" ON deals_processed_tracking;

-- Temporarily disable RLS to ensure the table works
ALTER TABLE deals_processed_tracking DISABLE ROW LEVEL SECURITY;

-- Re-enable RLS with proper policies
ALTER TABLE deals_processed_tracking ENABLE ROW LEVEL SECURITY;

-- Policy 1: Allow service role complete access (for API operations)
CREATE POLICY "service_role_complete_access" ON deals_processed_tracking
  FOR ALL TO service_role 
  USING (true) 
  WITH CHECK (true);

-- Policy 2: Allow authenticated users to read (for monitoring/dashboard)
CREATE POLICY "authenticated_users_read" ON deals_processed_tracking
  FOR SELECT TO authenticated 
  USING (true);

-- Policy 3: Allow anon users to read (if needed for public API access)
-- Uncomment the line below if you need anonymous access
-- CREATE POLICY "anon_read_access" ON deals_processed_tracking
--   FOR SELECT TO anon USING (true);

-- Verify the policies are working
-- You can run this query to test:
-- SELECT * FROM deals_processed_tracking LIMIT 1;
