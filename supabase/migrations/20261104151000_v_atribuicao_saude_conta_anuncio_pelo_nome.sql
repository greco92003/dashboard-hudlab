-- ============================================================
-- v_atribuicao_saude conta o anúncio achado pelo nome (2026-11-04)
--
-- O indicador mede se o lead chega ligado a um anúncio. Desde 01/11 a Meta
-- deixa de mandar o ID (utm_content) em parte dos cliques, mas o nome do
-- anúncio no utm_medium chega e v_contato_atribuicao acha o anúncio por ele
-- (os relatórios já usam isso). Contar só o utm_content mostrava 77% numa
-- semana em que quase todos os leads estavam ligados ao anúncio; decisão do
-- usuário: o indicador conta os dois. Se a recuperação pelo nome falhar (nome
-- ausente ou repetido no mesmo dia), o número cai do mesmo jeito.
--
-- Mesmas colunas e tipos; security_invoker continua false, como em produção.
-- ============================================================

CREATE OR REPLACE VIEW public.v_atribuicao_saude
WITH (security_invoker = false) AS
WITH base AS (
  SELECT o.created_at,
    c.id,
    (COALESCE(c.utm_content, '') <> '' OR a.chave_meta IS NOT NULL) AS identificado,
    (c.ad_id ~ '^[0-9]{10,}$' OR a.chave_meta ~ '^[0-9]{10,}$') AS ad_especifico,
    (c.ad_id ~ '^[0-9]{10,}$'
      OR a.chave_meta ~ '^[0-9]{10,}$'
      OR c.ad_id = 'link_in_bio'
      OR lower(COALESCE(NULLIF(c.utm_source, ''), NULLIF(c.source, ''), '')) ~ '(facebook|instagram|meta|^fb$)') AS meta
  FROM ghl_opportunities o
    JOIN ghl_contacts c ON c.id = o.contact_id
    LEFT JOIN v_contato_atribuicao a ON a.contact_id = c.id
  WHERE NOT EXISTS (SELECT 1 FROM v_contatos_importados vi WHERE vi.contact_id = c.id)
)
SELECT date_trunc('week', created_at AT TIME ZONE 'America/Sao_Paulo')::date AS semana,
  count(DISTINCT id) AS contatos,
  count(DISTINCT id) FILTER (WHERE identificado) AS com_utm,
  round(100.0 * count(DISTINCT id) FILTER (WHERE identificado)::numeric
    / NULLIF(count(DISTINCT id), 0)::numeric, 1) AS pct_com_utm,
  count(DISTINCT id) FILTER (WHERE identificado AND meta) AS com_match_meta,
  round(100.0 * count(DISTINCT id) FILTER (WHERE identificado AND meta)::numeric
    / NULLIF(count(DISTINCT id) FILTER (WHERE identificado), 0)::numeric, 1) AS pct_match_meta,
  count(DISTINCT id) FILTER (WHERE ad_especifico) AS com_ad_especifico,
  round(100.0 * count(DISTINCT id) FILTER (WHERE ad_especifico)::numeric
    / NULLIF(count(DISTINCT id) FILTER (WHERE identificado AND meta), 0)::numeric, 1) AS pct_ad_especifico
FROM base
GROUP BY date_trunc('week', created_at AT TIME ZONE 'America/Sao_Paulo')::date
ORDER BY date_trunc('week', created_at AT TIME ZONE 'America/Sao_Paulo')::date DESC;
