-- =====================================================
-- FIX FUNCTION SEARCH PATH MUTABLE SECURITY ISSUE
-- =====================================================
-- This migration fixes the security warning about functions with mutable search_path
-- by explicitly setting search_path to prevent potential SQL injection attacks
-- 
-- Issue: Function Search Path Mutable (SECURITY WARNING)
-- Remediation: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable
--
-- Affected functions:
-- 1. update_deals_tracking_updated_at
-- 2. get_deals_needing_check
-- 3. get_deals_with_custom_field_5
-- 4. update_partners_commission_settings_updated_at
-- 5. trigger_update_deals_tracking_updated_at_func (if exists)
-- 6. update_updated_at_column
-- =====================================================

-- =====================================================
-- 1. FIX: update_deals_tracking_updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION update_deals_tracking_updated_at()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_deals_tracking_updated_at() IS 'Trigger function to automatically update updated_at timestamp. SECURITY: search_path is set to prevent SQL injection.';

-- =====================================================
-- 2. FIX: get_deals_needing_check
-- =====================================================
CREATE OR REPLACE FUNCTION get_deals_needing_check(
  all_deal_ids TEXT[],
  all_deal_mdates TIMESTAMP WITH TIME ZONE[]
)
RETURNS TABLE(
  deal_id TEXT,
  is_new BOOLEAN,
  is_modified BOOLEAN,
  last_checked_at TIMESTAMP WITH TIME ZONE
) 
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH deal_input AS (
    SELECT 
      unnest(all_deal_ids) as input_deal_id,
      unnest(all_deal_mdates) as input_mdate
  ),
  tracking_data AS (
    SELECT 
      di.input_deal_id,
      di.input_mdate,
      dpt.deal_id as tracked_deal_id,
      dpt.deal_api_updated_at,
      dpt.last_checked_at as tracked_last_checked
    FROM deal_input di
    LEFT JOIN deals_processed_tracking dpt ON di.input_deal_id = dpt.deal_id
  )
  SELECT 
    td.input_deal_id::TEXT,
    (td.tracked_deal_id IS NULL)::BOOLEAN as is_new,
    (td.tracked_deal_id IS NOT NULL AND td.input_mdate > td.deal_api_updated_at)::BOOLEAN as is_modified,
    td.tracked_last_checked
  FROM tracking_data td
  WHERE td.tracked_deal_id IS NULL -- New deals
     OR (td.tracked_deal_id IS NOT NULL AND td.input_mdate > td.deal_api_updated_at); -- Modified deals
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_deals_needing_check(TEXT[], TIMESTAMP WITH TIME ZONE[]) IS 'Returns deals that need to be checked (new or modified). SECURITY: search_path is set to prevent SQL injection.';

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION get_deals_needing_check(TEXT[], TIMESTAMP WITH TIME ZONE[]) TO service_role;

-- =====================================================
-- 3. FIX: get_deals_with_custom_field_5
-- =====================================================
CREATE OR REPLACE FUNCTION get_deals_with_custom_field_5()
RETURNS TABLE(deal_id TEXT) 
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT dpt.deal_id
  FROM deals_processed_tracking dpt
  WHERE dpt.has_custom_field_5 = true;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_deals_with_custom_field_5() IS 'Returns deals that have custom field 5 set. SECURITY: search_path is set to prevent SQL injection.';

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION get_deals_with_custom_field_5() TO service_role;

-- =====================================================
-- 4. FIX: update_partners_commission_settings_updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION update_partners_commission_settings_updated_at()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_partners_commission_settings_updated_at() IS 'Trigger function to automatically update updated_at timestamp for partners_commission_settings. SECURITY: search_path is set to prevent SQL injection.';

-- =====================================================
-- 5. FIX: update_updated_at_column (generic function)
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_updated_at_column() IS 'Generic trigger function to automatically update updated_at timestamp. SECURITY: search_path is set to prevent SQL injection.';

-- =====================================================
-- 6. FIX: trigger_update_deals_tracking_updated_at_func (if it exists as separate function)
-- =====================================================
-- Note: This might be the same as update_deals_tracking_updated_at
-- Creating it separately in case it's referenced differently
CREATE OR REPLACE FUNCTION trigger_update_deals_tracking_updated_at_func()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trigger_update_deals_tracking_updated_at_func() IS 'Trigger function to automatically update updated_at timestamp for deals tracking. SECURITY: search_path is set to prevent SQL injection.';

-- =====================================================
-- VERIFICATION
-- =====================================================
-- You can verify the fix by running:
-- SELECT 
--   proname as function_name,
--   prosecdef as is_security_definer,
--   proconfig as search_path_config
-- FROM pg_proc 
-- WHERE proname IN (
--   'update_deals_tracking_updated_at',
--   'get_deals_needing_check',
--   'get_deals_with_custom_field_5',
--   'update_partners_commission_settings_updated_at',
--   'trigger_update_deals_tracking_updated_at_func',
--   'update_updated_at_column'
-- );
-- 
-- Expected: All functions should have search_path_config set to '{public,pg_temp}'
-- =====================================================

