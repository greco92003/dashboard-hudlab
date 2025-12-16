-- Create programacao_cache table for caching ActiveCampaign deals data
-- This table stores deals organized by shipping date (data de embarque)
-- without closing date and stage title fields

CREATE TABLE IF NOT EXISTS programacao_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Deal identification
  deal_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  
  -- Deal value information
  value NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'BRL',
  
  -- Stage information (only ID, no title)
  stage_id TEXT,
  
  -- Shipping date (Data de Embarque - custom field 54)
  data_embarque TEXT, -- Stored as DD/MM/YYYY format from ActiveCampaign
  
  -- Deal creation date
  created_date TIMESTAMP WITH TIME ZONE,
  
  -- Custom fields from ActiveCampaign
  estado TEXT,
  quantidade_pares TEXT,
  vendedor TEXT,
  designer TEXT,
  
  -- Contact and organization references
  contact_id TEXT,
  organization_id TEXT,
  
  -- Sync metadata
  last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  api_updated_at TIMESTAMP WITH TIME ZONE, -- mdate from ActiveCampaign
  sync_status TEXT DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending', 'error', 'deleted')),
  sync_error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_programacao_cache_deal_id ON programacao_cache(deal_id);
CREATE INDEX IF NOT EXISTS idx_programacao_cache_stage_id ON programacao_cache(stage_id) WHERE stage_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_programacao_cache_data_embarque ON programacao_cache(data_embarque) WHERE data_embarque IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_programacao_cache_sync_status ON programacao_cache(sync_status);
CREATE INDEX IF NOT EXISTS idx_programacao_cache_last_synced ON programacao_cache(last_synced_at);
CREATE INDEX IF NOT EXISTS idx_programacao_cache_vendedor ON programacao_cache(vendedor) WHERE vendedor IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_programacao_cache_designer ON programacao_cache(designer) WHERE designer IS NOT NULL;

-- Create trigger to automatically update updated_at
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

DROP TRIGGER IF EXISTS trigger_update_programacao_cache_updated_at ON programacao_cache;
CREATE TRIGGER trigger_update_programacao_cache_updated_at
  BEFORE UPDATE ON programacao_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_programacao_cache_updated_at();

-- Enable RLS (Row Level Security)
ALTER TABLE programacao_cache ENABLE ROW LEVEL SECURITY;

-- Policy for service role to manage all data (for sync operations)
CREATE POLICY "service_role_full_access" ON programacao_cache
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Policy for authenticated users to read data
CREATE POLICY "authenticated_read_only" ON programacao_cache
  FOR SELECT TO authenticated USING (true);

-- Add comments for documentation
COMMENT ON TABLE programacao_cache IS 'Cache table for ActiveCampaign deals organized by shipping date';
COMMENT ON COLUMN programacao_cache.deal_id IS 'Unique deal ID from ActiveCampaign';
COMMENT ON COLUMN programacao_cache.data_embarque IS 'Shipping date (Data de Embarque) from custom field 54 in DD/MM/YYYY format';
COMMENT ON COLUMN programacao_cache.sync_status IS 'Sync status: synced, pending, error, or deleted';
COMMENT ON COLUMN programacao_cache.api_updated_at IS 'Last update timestamp from ActiveCampaign API (mdate)';

