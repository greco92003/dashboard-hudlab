-- Fix security issue with update_programacao_cache_updated_at function
-- This migration adds SECURITY DEFINER and search_path settings to prevent SQL injection
-- Issue: Function had a mutable search_path which is a security vulnerability

-- =====================================================
-- FIX: update_programacao_cache_updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION update_programacao_cache_updated_at()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_programacao_cache_updated_at() IS 'Trigger function to automatically update updated_at timestamp. SECURITY: search_path is set to prevent SQL injection.';

-- Recreate the trigger to ensure it uses the updated function
DROP TRIGGER IF EXISTS trigger_update_programacao_cache_updated_at ON programacao_cache;
CREATE TRIGGER trigger_update_programacao_cache_updated_at
  BEFORE UPDATE ON programacao_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_programacao_cache_updated_at();

