-- Add new custom field columns to deals_cache table
-- These columns will store additional custom field values from ActiveCampaign

ALTER TABLE deals_cache 
ADD COLUMN IF NOT EXISTS custom_field_25 TEXT,
ADD COLUMN IF NOT EXISTS custom_field_39 TEXT,
ADD COLUMN IF NOT EXISTS custom_field_45 TEXT,
ADD COLUMN IF NOT EXISTS custom_field_47 TEXT;

-- Add comments to document what these fields represent
COMMENT ON COLUMN deals_cache.custom_field_25 IS 'ActiveCampaign custom field ID 25 value';
COMMENT ON COLUMN deals_cache.custom_field_39 IS 'ActiveCampaign custom field ID 39 value';
COMMENT ON COLUMN deals_cache.custom_field_45 IS 'ActiveCampaign custom field ID 45 value';
COMMENT ON COLUMN deals_cache.custom_field_47 IS 'ActiveCampaign custom field ID 47 value';

-- Create indexes for better query performance on the new custom fields
CREATE INDEX IF NOT EXISTS idx_deals_cache_custom_field_25 ON deals_cache(custom_field_25) WHERE custom_field_25 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_cache_custom_field_39 ON deals_cache(custom_field_39) WHERE custom_field_39 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_cache_custom_field_45 ON deals_cache(custom_field_45) WHERE custom_field_45 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_cache_custom_field_47 ON deals_cache(custom_field_47) WHERE custom_field_47 IS NOT NULL;
