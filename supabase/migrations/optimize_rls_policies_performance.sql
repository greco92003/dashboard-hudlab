-- =====================================================
-- OPTIMIZE RLS POLICIES FOR PERFORMANCE
-- =====================================================
-- This migration optimizes RLS policies by wrapping auth functions
-- in SELECT statements to prevent re-evaluation for each row.
-- 
-- Issue: Auth RLS Initialization Plan (PERFORMANCE WARNING)
-- Remediation: https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan
--
-- Performance Impact:
-- - Before: auth.uid() evaluated for EACH row (slow on large tables)
-- - After: (select auth.uid()) evaluated ONCE and reused (much faster)
--
-- Affected tables and policies:
-- 1. partners_commission_settings
--    - owners_admins_full_access_commission_settings
--    - partners_media_read_own_brand_commission_settings
-- 2. deals_sync_log
--    - service_role_complete_access
--    - authenticated_users_read
-- =====================================================

-- =====================================================
-- 1. OPTIMIZE: partners_commission_settings
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "owners_admins_full_access_commission_settings" ON partners_commission_settings;
DROP POLICY IF EXISTS "partners_media_read_own_brand_commission_settings" ON partners_commission_settings;

-- Recreate with optimized auth functions
CREATE POLICY "owners_admins_full_access_commission_settings"
ON partners_commission_settings
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE user_profiles.id = (select auth.uid()) 
    AND user_profiles.role IN ('admin', 'owner')
    AND user_profiles.approved = true
  )
);

COMMENT ON POLICY "owners_admins_full_access_commission_settings" ON partners_commission_settings IS 
'Allows owners and admins full access to commission settings. OPTIMIZED: Uses (select auth.uid()) for better performance.';

CREATE POLICY "partners_media_read_own_brand_commission_settings"
ON partners_commission_settings
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE user_profiles.id = (select auth.uid()) 
    AND user_profiles.role = 'partners-media'
    AND user_profiles.assigned_brand = partners_commission_settings.brand
    AND user_profiles.approved = true
  )
);

COMMENT ON POLICY "partners_media_read_own_brand_commission_settings" ON partners_commission_settings IS 
'Allows partners-media users to read commission settings for their assigned brand. OPTIMIZED: Uses (select auth.uid()) for better performance.';

-- =====================================================
-- 2. OPTIMIZE: deals_sync_log
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "service_role_complete_access" ON deals_sync_log;
DROP POLICY IF EXISTS "authenticated_users_read" ON deals_sync_log;

-- Recreate with optimized auth functions
CREATE POLICY "service_role_complete_access" ON deals_sync_log
FOR ALL 
USING (
  (select auth.jwt()) ->> 'role' = 'service_role' OR
  (select current_setting('role', true)) = 'service_role'
);

COMMENT ON POLICY "service_role_complete_access" ON deals_sync_log IS 
'Allows service role complete access to sync logs. OPTIMIZED: Uses (select auth.jwt()) for better performance.';

CREATE POLICY "authenticated_users_read" ON deals_sync_log
FOR SELECT 
USING (
  (select auth.role()) = 'authenticated'
);

COMMENT ON POLICY "authenticated_users_read" ON deals_sync_log IS 
'Allows authenticated users to read sync logs. OPTIMIZED: Uses (select auth.role()) for better performance.';

-- =====================================================
-- 3. OPTIMIZE: meta_insights
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view insights for their accessible accounts" ON meta_insights;
DROP POLICY IF EXISTS "Approved users can insert insights" ON meta_insights;
DROP POLICY IF EXISTS "Approved users can update insights" ON meta_insights;

-- Recreate with optimized auth functions
CREATE POLICY "Users can view insights for their accessible accounts" ON meta_insights
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = (select auth.uid())
      AND user_profiles.approved = true
    )
  );

CREATE POLICY "Approved users can insert insights" ON meta_insights
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = (select auth.uid())
      AND user_profiles.approved = true
    )
  );

CREATE POLICY "Approved users can update insights" ON meta_insights
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = (select auth.uid())
      AND user_profiles.approved = true
    )
  );

COMMENT ON POLICY "Users can view insights for their accessible accounts" ON meta_insights IS
'Allows approved users to view Meta insights. OPTIMIZED: Uses (select auth.uid()) for better performance.';

-- =====================================================
-- 4. OPTIMIZE: meta_ad_accounts and related tables
-- =====================================================

-- meta_ad_accounts
DROP POLICY IF EXISTS "Users can view Meta data if approved" ON meta_ad_accounts;
DROP POLICY IF EXISTS "Admins can manage Meta accounts" ON meta_ad_accounts;

CREATE POLICY "Users can view Meta data if approved" ON meta_ad_accounts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = (select auth.uid())
      AND user_profiles.approved = true
    )
  );

CREATE POLICY "Admins can manage Meta accounts" ON meta_ad_accounts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = (select auth.uid())
      AND user_profiles.role IN ('admin', 'owner')
      AND user_profiles.approved = true
    )
  );

-- meta_campaigns
DROP POLICY IF EXISTS "Users can view Meta campaigns if approved" ON meta_campaigns;
DROP POLICY IF EXISTS "Admins can manage Meta campaigns" ON meta_campaigns;

CREATE POLICY "Users can view Meta campaigns if approved" ON meta_campaigns
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = (select auth.uid())
      AND user_profiles.approved = true
    )
  );

CREATE POLICY "Admins can manage Meta campaigns" ON meta_campaigns
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = (select auth.uid())
      AND user_profiles.role IN ('admin', 'owner')
      AND user_profiles.approved = true
    )
  );

-- meta_ad_sets
DROP POLICY IF EXISTS "Users can view Meta ad sets if approved" ON meta_ad_sets;
DROP POLICY IF EXISTS "Admins can manage Meta ad sets" ON meta_ad_sets;

CREATE POLICY "Users can view Meta ad sets if approved" ON meta_ad_sets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = (select auth.uid())
      AND user_profiles.approved = true
    )
  );

CREATE POLICY "Admins can manage Meta ad sets" ON meta_ad_sets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = (select auth.uid())
      AND user_profiles.role IN ('admin', 'owner')
      AND user_profiles.approved = true
    )
  );

-- meta_ads
DROP POLICY IF EXISTS "Users can view Meta ads if approved" ON meta_ads;
DROP POLICY IF EXISTS "Admins can manage Meta ads" ON meta_ads;

CREATE POLICY "Users can view Meta ads if approved" ON meta_ads
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = (select auth.uid())
      AND user_profiles.approved = true
    )
  );

CREATE POLICY "Admins can manage Meta ads" ON meta_ads
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = (select auth.uid())
      AND user_profiles.role IN ('admin', 'owner')
      AND user_profiles.approved = true
    )
  );

-- meta_ad_creatives
DROP POLICY IF EXISTS "Users can view Meta creatives if approved" ON meta_ad_creatives;
DROP POLICY IF EXISTS "Admins can manage Meta creatives" ON meta_ad_creatives;

CREATE POLICY "Users can view Meta creatives if approved" ON meta_ad_creatives
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = (select auth.uid())
      AND user_profiles.approved = true
    )
  );

CREATE POLICY "Admins can manage Meta creatives" ON meta_ad_creatives
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = (select auth.uid())
      AND user_profiles.role IN ('admin', 'owner')
      AND user_profiles.approved = true
    )
  );

-- meta_custom_audiences
DROP POLICY IF EXISTS "Users can view Meta audiences if approved" ON meta_custom_audiences;
DROP POLICY IF EXISTS "Admins can manage Meta audiences" ON meta_custom_audiences;

CREATE POLICY "Users can view Meta audiences if approved" ON meta_custom_audiences
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = (select auth.uid())
      AND user_profiles.approved = true
    )
  );

CREATE POLICY "Admins can manage Meta audiences" ON meta_custom_audiences
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = (select auth.uid())
      AND user_profiles.role IN ('admin', 'owner')
      AND user_profiles.approved = true
    )
  );

-- =====================================================
-- 5. OPTIMIZE: generated_coupons
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Allow users to read their own generated coupons" ON generated_coupons;
DROP POLICY IF EXISTS "Allow partners-media to read coupons for their brand" ON generated_coupons;
DROP POLICY IF EXISTS "Allow admin and owner to create coupons for any brand" ON generated_coupons;
DROP POLICY IF EXISTS "Allow users to update their own coupons" ON generated_coupons;

-- Recreate with optimized auth functions
CREATE POLICY "Allow users to read their own generated coupons"
ON generated_coupons
FOR SELECT
TO authenticated
USING (created_by = (select auth.uid()));

CREATE POLICY "Allow partners-media to read coupons for their brand"
ON generated_coupons
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = (select auth.uid())
    AND user_profiles.role = 'partners-media'
    AND user_profiles.assigned_brand = generated_coupons.brand
    AND user_profiles.approved = true
  )
);

CREATE POLICY "Allow admin and owner to create coupons for any brand"
ON generated_coupons
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = (select auth.uid())
    AND user_profiles.role IN ('admin', 'owner')
    AND user_profiles.approved = true
  )
  AND created_by = (select auth.uid())
);

CREATE POLICY "Allow users to update their own coupons"
ON generated_coupons
FOR UPDATE
TO authenticated
USING (created_by = (select auth.uid()));

-- =====================================================
-- 6. OPTIMIZE: notifications system
-- =====================================================

-- notifications table
DROP POLICY IF EXISTS "Owners and admins can view all notifications" ON notifications;
DROP POLICY IF EXISTS "Owners and admins can create notifications" ON notifications;
DROP POLICY IF EXISTS "Owners and admins can update notifications" ON notifications;

CREATE POLICY "Owners and admins can view all notifications" ON notifications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Owners and admins can create notifications" ON notifications
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Owners and admins can update notifications" ON notifications
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND role IN ('owner', 'admin')
    )
  );

-- user_notifications table
DROP POLICY IF EXISTS "Users can view their own notifications" ON user_notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON user_notifications;

CREATE POLICY "Users can view their own notifications" ON user_notifications
  FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "Users can update their own notifications" ON user_notifications
  FOR UPDATE USING (user_id = (select auth.uid()));

-- push_subscriptions table
DROP POLICY IF EXISTS "Users can manage their own push subscriptions" ON push_subscriptions;

CREATE POLICY "Users can manage their own push subscriptions" ON push_subscriptions
  FOR ALL USING (user_id = (select auth.uid()));

-- =====================================================
-- 7. OPTIMIZE: designer_mockups_cache and sync_log
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Allow all operations on designer_mockups_cache for authenticated users" ON designer_mockups_cache;
DROP POLICY IF EXISTS "Allow all operations on designer_mockups_sync_log for authenticated users" ON designer_mockups_sync_log;

-- Recreate with optimized auth functions
CREATE POLICY "Allow all operations on designer_mockups_cache for authenticated users" ON designer_mockups_cache
FOR ALL USING (
  (select auth.role()) = 'authenticated' OR
  (select auth.jwt()) ->> 'role' = 'service_role' OR
  (select current_setting('role', true)) = 'service_role'
);

CREATE POLICY "Allow all operations on designer_mockups_sync_log for authenticated users" ON designer_mockups_sync_log
FOR ALL USING (
  (select auth.role()) = 'authenticated' OR
  (select auth.jwt()) ->> 'role' = 'service_role' OR
  (select current_setting('role', true)) = 'service_role'
);

-- =====================================================
-- 8. OPTIMIZE: nuvemshop_sync_log
-- =====================================================

-- Drop existing policy
DROP POLICY IF EXISTS "Allow sync log operations" ON nuvemshop_sync_log;

-- Recreate with optimized auth functions
CREATE POLICY "Allow sync log operations" ON nuvemshop_sync_log
FOR ALL USING (
  (select auth.role()) = 'authenticated' OR
  (select auth.jwt()) ->> 'role' = 'service_role' OR
  (select current_setting('role', true)) = 'service_role'
);

-- =====================================================
-- SUMMARY OF OPTIMIZATIONS
-- =====================================================
-- This migration optimized RLS policies for the following tables:
--
-- 1. partners_commission_settings (2 policies)
-- 2. deals_sync_log (2 policies)
-- 3. meta_insights (3 policies)
-- 4. meta_ad_accounts (2 policies)
-- 5. meta_campaigns (2 policies)
-- 6. meta_ad_sets (2 policies)
-- 7. meta_ads (2 policies)
-- 8. meta_ad_creatives (2 policies)
-- 9. meta_custom_audiences (2 policies)
-- 10. generated_coupons (4 policies)
-- 11. notifications (3 policies)
-- 12. user_notifications (2 policies)
-- 13. push_subscriptions (1 policy)
-- 14. designer_mockups_cache (1 policy)
-- 15. designer_mockups_sync_log (1 policy)
-- 16. nuvemshop_sync_log (1 policy)
--
-- TOTAL: 16 tables, 32+ policies optimized
--
-- Performance Impact:
-- - Queries on large tables will be significantly faster
-- - auth.uid() and auth.role() are now evaluated once per query instead of per row
-- - This is especially important for tables with thousands of rows
-- =====================================================

-- =====================================================
-- VERIFICATION QUERY
-- =====================================================
-- Run this query to verify the optimization was applied:
--
-- SELECT
--   schemaname,
--   tablename,
--   policyname,
--   permissive,
--   roles,
--   cmd,
--   qual,
--   with_check
-- FROM pg_policies
-- WHERE tablename IN (
--   'partners_commission_settings',
--   'deals_sync_log',
--   'meta_insights',
--   'meta_ad_accounts',
--   'meta_campaigns',
--   'meta_ad_sets',
--   'meta_ads',
--   'meta_ad_creatives',
--   'meta_custom_audiences',
--   'generated_coupons',
--   'notifications',
--   'user_notifications',
--   'push_subscriptions',
--   'designer_mockups_cache',
--   'designer_mockups_sync_log',
--   'nuvemshop_sync_log'
-- )
-- ORDER BY tablename, policyname;
--
-- Expected: All policies should use (select auth.xxx()) instead of auth.xxx()
--
-- To check for remaining non-optimized policies, run:
-- SELECT
--   schemaname,
--   tablename,
--   policyname,
--   qual
-- FROM pg_policies
-- WHERE qual LIKE '%auth.uid()%'
--    OR qual LIKE '%auth.role()%'
--    OR qual LIKE '%auth.jwt()%'
--    AND qual NOT LIKE '%(select auth.%'
-- ORDER BY tablename, policyname;
-- =====================================================

