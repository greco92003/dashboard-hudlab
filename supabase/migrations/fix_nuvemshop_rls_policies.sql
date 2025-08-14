-- Fix RLS policies for all nuvemshop tables to allow service role operations
-- This ensures that sync operations using the service role key can insert/update records
-- Applied on: 2025-01-18

-- =====================================================
-- NUVEMSHOP SYNC LOG TABLE
-- =====================================================

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Allow all operations on nuvemshop_sync_log for authenticated users" ON nuvemshop_sync_log;

-- Create a policy that allows all operations for authenticated users OR service role
CREATE POLICY "Allow sync log operations" ON nuvemshop_sync_log
FOR ALL USING (
  auth.role() = 'authenticated' OR
  auth.jwt() ->> 'role' = 'service_role' OR
  current_setting('role') = 'service_role'
);

-- =====================================================
-- NUVEMSHOP ORDERS TABLE
-- =====================================================

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Allow all operations on nuvemshop_orders for authenticated users" ON nuvemshop_orders;

-- Create a policy that allows all operations for authenticated users OR service role
CREATE POLICY "Allow orders operations" ON nuvemshop_orders
FOR ALL USING (
  auth.role() = 'authenticated' OR
  auth.jwt() ->> 'role' = 'service_role' OR
  current_setting('role') = 'service_role'
);

-- =====================================================
-- NUVEMSHOP PRODUCTS TABLE
-- =====================================================

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Allow all operations on nuvemshop_products for authenticated users" ON nuvemshop_products;

-- Create a policy that allows all operations for authenticated users OR service role
CREATE POLICY "Allow products operations" ON nuvemshop_products
FOR ALL USING (
  auth.role() = 'authenticated' OR
  auth.jwt() ->> 'role' = 'service_role' OR
  current_setting('role') = 'service_role'
);

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Verify all policies are correctly applied
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
-- FROM pg_policies 
-- WHERE tablename IN ('nuvemshop_orders', 'nuvemshop_products', 'nuvemshop_sync_log') 
-- ORDER BY tablename, policyname;

COMMENT ON POLICY "Allow sync log operations" ON nuvemshop_sync_log IS 'Allows sync operations using service role key to bypass RLS for automated sync processes';
COMMENT ON POLICY "Allow orders operations" ON nuvemshop_orders IS 'Allows sync operations using service role key to bypass RLS for automated sync processes';
COMMENT ON POLICY "Allow products operations" ON nuvemshop_products IS 'Allows sync operations using service role key to bypass RLS for automated sync processes';
