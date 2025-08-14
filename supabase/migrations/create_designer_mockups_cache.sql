-- Create designer_mockups_cache table for caching Google Sheets data
-- This table will store mockups and alterations data from Google Sheets API
-- to improve performance and reduce API quota usage

CREATE TABLE IF NOT EXISTS designer_mockups_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Business/Deal information
  nome_negocio TEXT NOT NULL,
  etapa_funil TEXT NOT NULL,
  designer TEXT NOT NULL,
  
  -- Date information (stored as both text and parsed date for flexibility)
  atualizado_em_raw TEXT, -- Original value from Google Sheets
  atualizado_em DATE, -- Parsed date for filtering
  
  -- Categorization for statistics
  is_mockup_feito BOOLEAN DEFAULT false,
  is_alteracao BOOLEAN DEFAULT false,
  
  -- Sync metadata
  last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sync_status TEXT DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending', 'error', 'deleted')),
  sync_error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_designer_mockups_cache_designer ON designer_mockups_cache(designer);
CREATE INDEX IF NOT EXISTS idx_designer_mockups_cache_atualizado_em ON designer_mockups_cache(atualizado_em) WHERE atualizado_em IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_designer_mockups_cache_etapa_funil ON designer_mockups_cache(etapa_funil);
CREATE INDEX IF NOT EXISTS idx_designer_mockups_cache_sync_status ON designer_mockups_cache(sync_status);
CREATE INDEX IF NOT EXISTS idx_designer_mockups_cache_last_synced ON designer_mockups_cache(last_synced_at);

-- Composite index for common queries (designer + date range)
CREATE INDEX IF NOT EXISTS idx_designer_mockups_cache_designer_date ON designer_mockups_cache(designer, atualizado_em) WHERE atualizado_em IS NOT NULL;

-- Create unique constraint to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_designer_mockups_cache_unique ON designer_mockups_cache(nome_negocio, designer, etapa_funil, atualizado_em_raw);

-- Create sync log table for tracking Google Sheets synchronizations
CREATE TABLE IF NOT EXISTS designer_mockups_sync_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Sync details
  sync_type TEXT NOT NULL DEFAULT 'full' CHECK (sync_type IN ('full', 'incremental')),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  
  -- Date range for the sync
  date_range_start DATE,
  date_range_end DATE,
  
  -- Sync statistics
  total_records INTEGER DEFAULT 0,
  processed_records INTEGER DEFAULT 0,
  new_records INTEGER DEFAULT 0,
  updated_records INTEGER DEFAULT 0,
  error_records INTEGER DEFAULT 0,
  
  -- Timing
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  
  -- Error handling
  error_message TEXT,
  error_details JSONB,
  
  -- Metadata
  triggered_by TEXT DEFAULT 'manual', -- 'manual', 'cron', 'api'
  google_sheets_id TEXT,
  google_sheets_range TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for sync log
CREATE INDEX IF NOT EXISTS idx_designer_mockups_sync_log_status ON designer_mockups_sync_log(status);
CREATE INDEX IF NOT EXISTS idx_designer_mockups_sync_log_started_at ON designer_mockups_sync_log(started_at);
CREATE INDEX IF NOT EXISTS idx_designer_mockups_sync_log_date_range ON designer_mockups_sync_log(date_range_start, date_range_end);

-- Function to get designer mockups statistics for a date range
CREATE OR REPLACE FUNCTION get_designer_mockups_stats(
  p_designers TEXT[],
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  designer TEXT,
  quantidade_negocios BIGINT,
  mockups_feitos BIGINT,
  alteracoes_feitas BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dmc.designer,
    COUNT(DISTINCT dmc.nome_negocio) as quantidade_negocios,
    COUNT(*) FILTER (WHERE dmc.is_mockup_feito = true) as mockups_feitos,
    COUNT(*) FILTER (WHERE dmc.is_alteracao = true) as alteracoes_feitas
  FROM designer_mockups_cache dmc
  WHERE 
    (p_designers IS NULL OR dmc.designer = ANY(p_designers))
    AND (p_start_date IS NULL OR dmc.atualizado_em >= p_start_date)
    AND (p_end_date IS NULL OR dmc.atualizado_em <= p_end_date)
    AND dmc.sync_status = 'synced'
  GROUP BY dmc.designer
  ORDER BY dmc.designer;
END;
$$;

-- Function to get last sync status
CREATE OR REPLACE FUNCTION get_last_designer_mockups_sync()
RETURNS TABLE (
  last_sync_at TIMESTAMP WITH TIME ZONE,
  status TEXT,
  total_records INTEGER,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dmsl.completed_at as last_sync_at,
    dmsl.status,
    dmsl.total_records,
    dmsl.error_message
  FROM designer_mockups_sync_log dmsl
  ORDER BY dmsl.started_at DESC
  LIMIT 1;
END;
$$;

-- Enable RLS
ALTER TABLE designer_mockups_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE designer_mockups_sync_log ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow all operations on designer_mockups_cache for authenticated users" ON designer_mockups_cache
FOR ALL USING (
  auth.role() = 'authenticated' OR
  auth.jwt() ->> 'role' = 'service_role' OR
  current_setting('role') = 'service_role'
);

CREATE POLICY "Allow all operations on designer_mockups_sync_log for authenticated users" ON designer_mockups_sync_log
FOR ALL USING (
  auth.role() = 'authenticated' OR
  auth.jwt() ->> 'role' = 'service_role' OR
  current_setting('role') = 'service_role'
);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_designer_mockups_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_designer_mockups_cache_updated_at
  BEFORE UPDATE ON designer_mockups_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_designer_mockups_cache_updated_at();

-- Grant necessary permissions
GRANT ALL ON designer_mockups_cache TO authenticated;
GRANT ALL ON designer_mockups_sync_log TO authenticated;
GRANT EXECUTE ON FUNCTION get_designer_mockups_stats TO authenticated;
GRANT EXECUTE ON FUNCTION get_last_designer_mockups_sync TO authenticated;
