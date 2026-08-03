-- ============================================================
-- Criado em 2026-08-03 (aplicado no Dashboard-v2 via MCP)
--
-- v_atribuicao_saude nunca excluía public.v_contatos_importados (criada
-- em 2026-07-25 pro mesmo problema, mas só aplicada em
-- get_funnel_por_anuncio/get_funil_etapas/_kpis_periodo -- essa view de
-- saúde da atribuição ficou de fora por engano).
--
-- Achado ao investigar alerta de "20% de leads com UTM na última
-- semana": novo lote de migração do CRM antigo em 03/08 (tag
-- "import-03-08-26", 9 contatos criados em ~8 segundos, mesma
-- assinatura do lote de 24/07 -- "blackfinal", "fechamesjunho26" etc.,
-- sem UTM real por serem registros históricos). Sem a exclusão, esses
-- contatos derrubavam pct_com_utm de ~90% pro real pra 35% no dia.
-- Confirmado com o filtro aplicado manualmente: 35%->63,6% no dia (o
-- resto do gap é "CadastroManual" -- registro manual da equipe,
-- fenômeno separado e esperado, não é quebra de atribuição).
-- ============================================================

CREATE OR REPLACE VIEW public.v_atribuicao_saude
WITH (security_invoker = true) AS
SELECT
  date_trunc('week', o.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS semana,
  count(DISTINCT c.id) AS contatos,
  count(DISTINCT c.id) FILTER (WHERE c.utm_content IS NOT NULL AND c.utm_content <> '') AS com_utm,
  round(100.0 * count(DISTINCT c.id) FILTER (WHERE c.utm_content IS NOT NULL AND c.utm_content <> '')::numeric
    / NULLIF(count(DISTINCT c.id), 0)::numeric, 1) AS pct_com_utm,
  count(DISTINCT c.id) FILTER (
    WHERE c.utm_content IS NOT NULL AND c.utm_content <> ''
    AND (c.ad_id ~ '^[0-9]{10,}$'
      OR c.ad_id = 'link_in_bio'
      OR lower(COALESCE(NULLIF(c.utm_source, ''), NULLIF(c.source, ''), '')) ~ '(facebook|instagram|meta|^fb$)')
  ) AS com_match_meta,
  round(100.0 * count(DISTINCT c.id) FILTER (
    WHERE c.utm_content IS NOT NULL AND c.utm_content <> ''
    AND (c.ad_id ~ '^[0-9]{10,}$'
      OR c.ad_id = 'link_in_bio'
      OR lower(COALESCE(NULLIF(c.utm_source, ''), NULLIF(c.source, ''), '')) ~ '(facebook|instagram|meta|^fb$)')
  )::numeric / NULLIF(count(DISTINCT c.id) FILTER (WHERE c.utm_content IS NOT NULL AND c.utm_content <> ''), 0)::numeric, 1) AS pct_match_meta,
  count(DISTINCT c.id) FILTER (WHERE c.ad_id ~ '^[0-9]{10,}$') AS com_ad_especifico,
  round(100.0 * count(DISTINCT c.id) FILTER (WHERE c.ad_id ~ '^[0-9]{10,}$')::numeric
    / NULLIF(count(DISTINCT c.id) FILTER (
      WHERE c.utm_content IS NOT NULL AND c.utm_content <> ''
      AND (c.ad_id ~ '^[0-9]{10,}$'
        OR c.ad_id = 'link_in_bio'
        OR lower(COALESCE(NULLIF(c.utm_source, ''), NULLIF(c.source, ''), '')) ~ '(facebook|instagram|meta|^fb$)')
    ), 0)::numeric, 1) AS pct_ad_especifico
FROM ghl_opportunities o
JOIN ghl_contacts c ON c.id = o.contact_id
WHERE NOT EXISTS (SELECT 1 FROM public.v_contatos_importados vi WHERE vi.contact_id = c.id)
GROUP BY (date_trunc('week', o.created_at AT TIME ZONE 'America/Sao_Paulo')::date)
ORDER BY (date_trunc('week', o.created_at AT TIME ZONE 'America/Sao_Paulo')::date) DESC;
