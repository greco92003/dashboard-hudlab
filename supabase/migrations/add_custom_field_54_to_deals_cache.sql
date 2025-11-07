-- Add custom field 54 to deals_cache table
-- This column will store custom field 54 value from ActiveCampaign

ALTER TABLE deals_cache 
ADD COLUMN IF NOT EXISTS custom_field_54 TEXT;

-- Add comment to document what this field represents
COMMENT ON COLUMN deals_cache.custom_field_54 IS 'ActiveCampaign custom field ID 54 value';

-- Create index for better query performance on the new custom field
CREATE INDEX IF NOT EXISTS idx_deals_cache_custom_field_54 ON deals_cache(custom_field_54) WHERE custom_field_54 IS NOT NULL;

