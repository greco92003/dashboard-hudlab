-- ============================================================
-- v_contato_atribuicao: anúncio pelo nome e pelo dia (2026-11-04)
--
-- Desde 01/11 parte dos cliques da Meta chega ao site sem utm_content (ID do
-- anúncio): a URL traz o fbclid, mas não os IDs que a Meta acrescenta depois
-- dele. O link base (utm_medium = nome do anúncio) sempre chega.
--
-- A view já recuperava o anúncio pelo nome quando o nome existiu em um único
-- anúncio no histórico (nomes). Nome repetido ficava sem anúncio: a cópia do
-- 3PrintVideoAlgoritmo no Validados (31/10) tem o mesmo nome do original, e 8
-- leads de 01 a 04/11 ficaram fora dos relatórios.
--
-- Agora, se o nome é repetido, vale o único anúncio com esse nome que teve
-- clique no link no dia do lead (nomes_dia). Dia com dois anúncios de mesmo
-- nome com clique continua sem anúncio.
--
-- Esta view não estava versionada (criada direto no banco); a definição abaixo
-- é a de produção em 04/11 mais nomes_dia e a coluna dia.
-- ============================================================

CREATE OR REPLACE VIEW public.v_contato_atribuicao
WITH (security_invoker = true) AS
WITH campanhas AS (
  SELECT DISTINCT m.campaign_id
  FROM meta_insights_daily m
  WHERE m.campaign_id IS NOT NULL
), nomes AS (
  SELECT lower(regexp_replace(m.ad_name, '[^a-zA-Z0-9]', '', 'g')) AS nome,
    min(m.ad_id) AS ad_id
  FROM meta_insights_daily m
  WHERE COALESCE(m.ad_name, '') <> ''
  GROUP BY lower(regexp_replace(m.ad_name, '[^a-zA-Z0-9]', '', 'g'))
  HAVING count(DISTINCT m.ad_id) = 1
), nomes_dia AS (
  -- Nome repetido no histórico: o único anúncio com esse nome e clique no dia.
  SELECT lower(regexp_replace(m.ad_name, '[^a-zA-Z0-9]', '', 'g')) AS nome,
    m.date AS dia,
    min(m.ad_id) AS ad_id
  FROM meta_insights_daily m
  WHERE COALESCE(m.ad_name, '') <> '' AND COALESCE(m.link_clicks, 0) > 0
  GROUP BY lower(regexp_replace(m.ad_name, '[^a-zA-Z0-9]', '', 'g')), m.date
  HAVING count(DISTINCT m.ad_id) = 1
), base AS (
  SELECT c.id AS contact_id,
    c.ad_id,
    c.utm_campaign,
    lower(COALESCE(NULLIF(c.utm_source, ''), NULLIF(c.source, ''), '')) AS origem,
    NULLIF(lower(NULLIF(c.utm_source, '')), 'website') AS utm_source_real,
    (EXISTS (SELECT 1 FROM v_contatos_importados i WHERE i.contact_id = c.id)) AS importado,
    (c.ad_id = 'link_in_bio' AND c.utm_campaign IN (SELECT campanhas.campaign_id FROM campanhas)) AS bio_com_campanha,
    NULLIF(lower(regexp_replace(COALESCE(c.utm_content, ''), '[^a-zA-Z0-9]', '', 'g')), '') AS nome_content,
    NULLIF(lower(regexp_replace(COALESCE(c.utm_medium, ''), '[^a-zA-Z0-9]', '', 'g')), '') AS nome_medium,
    (c.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia
  FROM ghl_contacts c
), classif AS (
  SELECT b.contact_id,
    b.ad_id,
    b.utm_campaign,
    b.origem,
    b.utm_source_real,
    b.importado,
    b.bio_com_campanha,
    (b.ad_id ~ '^[0-9]{10,}$' AND (NOT b.importado OR EXISTS (SELECT 1 FROM meta_ad_attributes a WHERE a.ad_id = b.ad_id))) AS anuncio_meta,
    CASE
      WHEN b.importado THEN NULL::text
      ELSE COALESCE(n1.ad_id, n2.ad_id, nd.ad_id)
    END AS anuncio_por_nome
  FROM base b
    LEFT JOIN nomes n1 ON n1.nome = b.nome_content
    LEFT JOIN nomes n2 ON n2.nome = b.nome_medium
    LEFT JOIN nomes_dia nd ON nd.nome = b.nome_medium AND nd.dia = b.dia
)
SELECT contact_id,
  CASE
    WHEN anuncio_meta THEN ad_id
    WHEN bio_com_campanha THEN 'bio:' || utm_campaign
    WHEN anuncio_por_nome IS NOT NULL THEN anuncio_por_nome
    ELSE NULL::text
  END AS chave_meta,
  CASE
    WHEN anuncio_meta OR bio_com_campanha OR anuncio_por_nome IS NOT NULL THEN 'Meta Ads'
    WHEN importado THEN 'Base antiga (CRM anterior)'
    WHEN ad_id = 'link_in_bio' OR origem ~ '(facebook|instagram|meta|^fb$)' THEN 'Instagram/Facebook (perfil)'
    WHEN origem ~ 'google' THEN 'Google Ads'
    WHEN origem ~ '(indica|referral)' THEN 'Indicação'
    WHEN utm_source_real IS NULL THEN 'Orgânico'
    ELSE 'Outros'
  END AS fonte
FROM classif;
