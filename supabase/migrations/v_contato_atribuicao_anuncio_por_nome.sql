-- ============================================================
-- Atribuição pelo nome do anúncio (2026-10-21)
--
-- O template de UTM dos anúncios manda utm_medium={{ad.name}} e
-- utm_content={{ad.id}}. Parte dos leads chega sem o utm_content (ou com
-- link_in_bio) mas com o nome do anúncio no utm_medium -- ex.: 2170 Deric
-- (Dubai Club, R$ 4.180, "JornalNegocioV2.7") e 2162 Bruna (Heroes,
-- "3PrintVideoAlgoritmo"). Sem o ID, a venda caía em "Instagram/Facebook
-- (perfil)" e sumia da aba Anúncios.
--
-- Regra nova, só quando não há ID numérico nem bio com campanha (nada do que
-- já estava atribuído muda): o nome no utm_content ou no utm_medium,
-- comparado só por letras e números e sem maiúsculas, aponta para UM anúncio
-- do meta_insights_daily. Nome que existe em mais de um anúncio fica de fora.
-- Contato importado do CRM antigo não entra: as vendas dele são de antes da
-- coleta do Meta, e a recompra continua como "Base antiga".
--
-- mv_contato_atribuicao lê esta view; o cron refresh-contatos-importados-30min
-- atualiza o resultado.
-- ============================================================

CREATE OR REPLACE VIEW public.v_contato_atribuicao
WITH (security_invoker = true) AS
WITH campanhas AS (
  SELECT DISTINCT m.campaign_id
  FROM public.meta_insights_daily m
  WHERE m.campaign_id IS NOT NULL
),
nomes AS (
  SELECT
    lower(regexp_replace(m.ad_name, '[^a-zA-Z0-9]', '', 'g')) AS nome,
    min(m.ad_id) AS ad_id
  FROM public.meta_insights_daily m
  WHERE COALESCE(m.ad_name, '') <> ''
  GROUP BY 1
  HAVING count(DISTINCT m.ad_id) = 1
),
base AS (
  SELECT
    c.id AS contact_id,
    c.ad_id,
    c.utm_campaign,
    lower(COALESCE(NULLIF(c.utm_source, ''), NULLIF(c.source, ''), '')) AS origem,
    NULLIF(lower(NULLIF(c.utm_source, '')), 'website') AS utm_source_real,
    EXISTS (
      SELECT 1 FROM public.v_contatos_importados i WHERE i.contact_id = c.id
    ) AS importado,
    c.ad_id = 'link_in_bio'
      AND c.utm_campaign IN (SELECT campanhas.campaign_id FROM campanhas) AS bio_com_campanha,
    NULLIF(lower(regexp_replace(COALESCE(c.utm_content, ''), '[^a-zA-Z0-9]', '', 'g')), '') AS nome_content,
    NULLIF(lower(regexp_replace(COALESCE(c.utm_medium, ''), '[^a-zA-Z0-9]', '', 'g')), '') AS nome_medium
  FROM public.ghl_contacts c
),
classif AS (
  SELECT
    b.contact_id,
    b.ad_id,
    b.utm_campaign,
    b.origem,
    b.utm_source_real,
    b.importado,
    b.bio_com_campanha,
    b.ad_id ~ '^[0-9]{10,}$'
      AND (NOT b.importado OR EXISTS (
        SELECT 1 FROM public.meta_ad_attributes a WHERE a.ad_id = b.ad_id
      )) AS anuncio_meta,
    CASE WHEN b.importado THEN NULL ELSE COALESCE(n1.ad_id, n2.ad_id) END AS anuncio_por_nome
  FROM base b
  LEFT JOIN nomes n1 ON n1.nome = b.nome_content
  LEFT JOIN nomes n2 ON n2.nome = b.nome_medium
)
SELECT
  contact_id,
  CASE
    WHEN anuncio_meta THEN ad_id
    WHEN bio_com_campanha THEN 'bio:' || utm_campaign
    WHEN anuncio_por_nome IS NOT NULL THEN anuncio_por_nome
    ELSE NULL
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
