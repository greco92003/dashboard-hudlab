-- Add UTM fields to deals_cache table
-- These columns will store UTM Source and UTM Medium from ActiveCampaign custom fields

ALTER TABLE deals_cache 
ADD COLUMN IF NOT EXISTS "utm-source" TEXT,
ADD COLUMN IF NOT EXISTS "utm-medium" TEXT;

-- Add comments to document what these fields represent
COMMENT ON COLUMN deals_cache."utm-source" IS 'ActiveCampaign custom field ID 49 - UTM Source';
COMMENT ON COLUMN deals_cache."utm-medium" IS 'ActiveCampaign custom field ID 50 - UTM Medium';

-- Create indexes for better query performance on the new UTM fields
CREATE INDEX IF NOT EXISTS idx_deals_cache_utm_source ON deals_cache("utm-source") WHERE "utm-source" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_cache_utm_medium ON deals_cache("utm-medium") WHERE "utm-medium" IS NOT NULL;

-- Create a composite index for UTM attribution analysis
CREATE INDEX IF NOT EXISTS idx_deals_cache_utm_attribution ON deals_cache("utm-source", "utm-medium") WHERE "utm-source" IS NOT NULL AND "utm-medium" IS NOT NULL;
