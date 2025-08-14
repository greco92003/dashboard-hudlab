-- Fix RLS policies for nuvemshop_sync_log table to allow service role operations
-- This ensures that sync operations using the service role key can insert/update logs

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Allow all operations on nuvemshop_sync_log for authenticated users" ON nuvemshop_sync_log;

-- Create a simple policy that allows all operations for authenticated users OR service role
CREATE POLICY "Allow sync log operations" ON nuvemshop_sync_log
FOR ALL USING (
  auth.role() = 'authenticated' OR
  auth.jwt() ->> 'role' = 'service_role' OR
  current_setting('role') = 'service_role'
);
