-- Remove duplicate function definitions
-- Keep only the DATE version (correct one)

-- Drop all versions of the function
DROP FUNCTION IF EXISTS get_designer_mockups_stats(text[], timestamp with time zone, timestamp with time zone);
DROP FUNCTION IF EXISTS get_designer_mockups_stats(text[], date, date);

-- Recreate the function with the correct signature (DATE version)
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
    COUNT(DISTINCT dmc.nome_negocio) FILTER (WHERE dmc.is_mockup_feito = true) as mockups_feitos,
    COUNT(DISTINCT dmc.nome_negocio) FILTER (WHERE dmc.is_alteracao = true) as alteracoes_feitas
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

