-- Add support for Arquivo de Serigrafia tracking
-- This migration adds a new field to track screen printing files (Arquivo de Serigrafia)
-- alongside mockups and alterations

-- Add new column to track screen printing files
ALTER TABLE designer_mockups_cache 
ADD COLUMN IF NOT EXISTS is_arquivo_serigrafia BOOLEAN DEFAULT false;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_designer_mockups_cache_arquivo_serigrafia 
ON designer_mockups_cache(is_arquivo_serigrafia) 
WHERE is_arquivo_serigrafia = true;

-- Update the get_designer_mockups_stats function to include screen printing files
CREATE OR REPLACE FUNCTION get_designer_mockups_stats(
  p_designers TEXT[],
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  designer TEXT,
  quantidade_negocios BIGINT,
  mockups_feitos BIGINT,
  alteracoes_feitas BIGINT,
  arquivos_serigrafia BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dmc.designer,
    COUNT(DISTINCT dmc.nome_negocio) as quantidade_negocios,
    COUNT(DISTINCT dmc.nome_negocio) FILTER (WHERE dmc.is_mockup_feito = true) as mockups_feitos,
    COUNT(DISTINCT dmc.nome_negocio) FILTER (WHERE dmc.is_alteracao = true) as alteracoes_feitas,
    COUNT(DISTINCT dmc.nome_negocio) FILTER (WHERE dmc.is_arquivo_serigrafia = true) as arquivos_serigrafia
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

-- Add comment for documentation
COMMENT ON COLUMN designer_mockups_cache.is_arquivo_serigrafia IS 'Indicates if this entry is a screen printing file (Arquivo de Serigrafia)';

