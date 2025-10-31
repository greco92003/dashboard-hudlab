-- Fix: Count all mockups and alterations, not just unique businesses
-- Each row in the sheet represents a separate mockup or alteration that should be counted
-- If the same business has 2 alterations, both should be counted

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

