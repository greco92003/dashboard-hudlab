-- Add contact custom field columns to deals_cache and deals_live tables
-- These columns will store contact field values from ActiveCampaign
-- Field 7 = Segmento de Negócio (Business Segment)
-- Field 50 = Intenção de Compra (Purchase Intent)

-- Add columns to deals_cache table
ALTER TABLE deals_cache 
ADD COLUMN IF NOT EXISTS segmento_de_negocio TEXT,
ADD COLUMN IF NOT EXISTS intencao_de_compra TEXT;

-- Add columns to deals_live table
ALTER TABLE deals_live 
ADD COLUMN IF NOT EXISTS segmento_de_negocio TEXT,
ADD COLUMN IF NOT EXISTS intencao_de_compra TEXT;

-- Add comments to document what these fields represent
COMMENT ON COLUMN deals_cache.segmento_de_negocio IS 'ActiveCampaign contact field ID 7 - Segmento de Negócio (Business Segment)';
COMMENT ON COLUMN deals_cache.intencao_de_compra IS 'ActiveCampaign contact field ID 50 - Intenção de Compra (Purchase Intent)';

COMMENT ON COLUMN deals_live.segmento_de_negocio IS 'ActiveCampaign contact field ID 7 - Segmento de Negócio (Business Segment)';
COMMENT ON COLUMN deals_live.intencao_de_compra IS 'ActiveCampaign contact field ID 50 - Intenção de Compra (Purchase Intent)';

-- Create indexes for better query performance on the new contact fields
CREATE INDEX IF NOT EXISTS idx_deals_cache_segmento_de_negocio ON deals_cache(segmento_de_negocio) WHERE segmento_de_negocio IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_cache_intencao_de_compra ON deals_cache(intencao_de_compra) WHERE intencao_de_compra IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_deals_live_segmento_de_negocio ON deals_live(segmento_de_negocio) WHERE segmento_de_negocio IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_live_intencao_de_compra ON deals_live(intencao_de_compra) WHERE intencao_de_compra IS NOT NULL;

-- Create composite indexes for contact field analysis
CREATE INDEX IF NOT EXISTS idx_deals_cache_contact_fields ON deals_cache(segmento_de_negocio, intencao_de_compra) 
WHERE segmento_de_negocio IS NOT NULL OR intencao_de_compra IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_deals_live_contact_fields ON deals_live(segmento_de_negocio, intencao_de_compra) 
WHERE segmento_de_negocio IS NOT NULL OR intencao_de_compra IS NOT NULL;

