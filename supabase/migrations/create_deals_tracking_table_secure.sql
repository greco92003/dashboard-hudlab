-- Create deals tracking table for incremental sync optimization
-- This table tracks which deals have been analyzed for custom fields
-- to avoid re-fetching them in subsequent syncs

CREATE TABLE IF NOT EXISTS deals_processed_tracking (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Deal identification
  deal_id TEXT UNIQUE NOT NULL,
  
  -- Custom field tracking
  has_custom_field_5 BOOLEAN NOT NULL DEFAULT false, -- Data Fechamento (most important)
  has_any_target_fields BOOLEAN NOT NULL DEFAULT false, -- Any of TARGET_CUSTOM_FIELD_IDS
  target_fields_found INTEGER[] DEFAULT '{}', -- Array of found field IDs
  
  -- Tracking metadata
  last_checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deal_api_updated_at TIMESTAMP WITH TIME ZONE, -- mdate from ActiveCampaign when last checked
  deal_created_at TIMESTAMP WITH TIME ZONE, -- cdate from ActiveCampaign
  
  -- Performance tracking
  sync_batch_id TEXT, -- To track which sync batch processed this deal
  processing_time_ms INTEGER, -- Time taken to process this deal's custom fields
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for optimal query performance
CREATE INDEX IF NOT EXISTS idx_deals_tracking_deal_id ON deals_processed_tracking(deal_id);
CREATE INDEX IF NOT EXISTS idx_deals_tracking_has_field_5 ON deals_processed_tracking(has_custom_field_5) WHERE has_custom_field_5 = true;
CREATE INDEX IF NOT EXISTS idx_deals_tracking_has_any_fields ON deals_processed_tracking(has_any_target_fields) WHERE has_any_target_fields = true;
CREATE INDEX IF NOT EXISTS idx_deals_tracking_last_checked ON deals_processed_tracking(last_checked_at);
CREATE INDEX IF NOT EXISTS idx_deals_tracking_api_updated ON deals_processed_tracking(deal_api_updated_at) WHERE deal_api_updated_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_tracking_sync_batch ON deals_processed_tracking(sync_batch_id) WHERE sync_batch_id IS NOT NULL;

-- Create composite index for efficient incremental sync queries
CREATE INDEX IF NOT EXISTS idx_deals_tracking_incremental_sync 
ON deals_processed_tracking(deal_api_updated_at, last_checked_at) 
WHERE deal_api_updated_at IS NOT NULL;

-- Add comments for documentation
COMMENT ON TABLE deals_processed_tracking IS 'Tracks which deals have been analyzed for custom fields to enable incremental sync optimization';
COMMENT ON COLUMN deals_processed_tracking.deal_id IS 'ActiveCampaign deal ID (unique identifier)';
COMMENT ON COLUMN deals_processed_tracking.has_custom_field_5 IS 'Whether deal has custom field ID 5 (Data Fechamento) - primary filter field';
COMMENT ON COLUMN deals_processed_tracking.has_any_target_fields IS 'Whether deal has any of the target custom field IDs [5,25,39,45,47,49,50]';
COMMENT ON COLUMN deals_processed_tracking.target_fields_found IS 'Array of target custom field IDs found for this deal';
COMMENT ON COLUMN deals_processed_tracking.last_checked_at IS 'When this deal was last analyzed for custom fields';
COMMENT ON COLUMN deals_processed_tracking.deal_api_updated_at IS 'ActiveCampaign mdate when deal was last checked (for detecting modifications)';
COMMENT ON COLUMN deals_processed_tracking.sync_batch_id IS 'Identifier of the sync batch that processed this deal';

-- Create function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_deals_tracking_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER trigger_update_deals_tracking_updated_at
  BEFORE UPDATE ON deals_processed_tracking
  FOR EACH ROW
  EXECUTE FUNCTION update_deals_tracking_updated_at();

-- Enable RLS (Row Level Security)
ALTER TABLE deals_processed_tracking ENABLE ROW LEVEL SECURITY;

-- Policy for service role to manage all tracking data (for sync operations)
CREATE POLICY "service_role_full_access" ON deals_processed_tracking
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Policy for authenticated users to read tracking data (for monitoring)
CREATE POLICY "authenticated_read_only" ON deals_processed_tracking
  FOR SELECT TO authenticated USING (true);

-- Additional policy to allow inserts/updates from the API (bypass RLS for service operations)
CREATE POLICY "api_service_operations" ON deals_processed_tracking
  FOR ALL USING (true) WITH CHECK (true);

-- Create function to get deals that need to be checked (new or modified)
-- This function is SECURITY DEFINER to allow service role access
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
SET search_path = public
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

-- Grant execute permission on the function to service role
GRANT EXECUTE ON FUNCTION get_deals_needing_check(TEXT[], TIMESTAMP WITH TIME ZONE[]) TO service_role;

-- Create function to get deals with custom field 5 (for second part of sync)
-- This function is SECURITY DEFINER to allow service role access
CREATE OR REPLACE FUNCTION get_deals_with_custom_field_5()
RETURNS TABLE(deal_id TEXT) 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT dpt.deal_id
  FROM deals_processed_tracking dpt
  WHERE dpt.has_custom_field_5 = true;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission on the function to service role
GRANT EXECUTE ON FUNCTION get_deals_with_custom_field_5() TO service_role;
