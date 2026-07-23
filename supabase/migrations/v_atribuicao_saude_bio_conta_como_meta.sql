-- ============================================================
-- Ajuste 2026-07-23 (aplicado no Dashboard-v2 via MCP)
--
-- Bio/perfil do Instagram-Facebook já é tratado como receita atribuída ao
-- Meta no ROAS/Leads/Mockup gerais da Visão Geral (v_desempenho_fonte trata
-- como fonte própria "Instagram/Facebook (perfil)", mas soma como Meta no
-- agregado). "Saúde da Atribuição" contava esse mesmo tráfego como "sem
-- match" só porque não identifica um ad_id específico -- inflando a
-- aparência de quebra de atribuição (ex.: 81,4% na semana de 20/07, quando
-- na verdade é 97,7% depois de contar Bio como atribuído).
--
-- com_match_meta/pct_match_meta agora consideram "atribuído ao Meta" =
-- bate com ad_id OU é tráfego de perfil Meta (mesma regra de
-- v_desempenho_fonte, exige utm_content presente). Novo par
-- com_ad_especifico/pct_ad_especifico mede, dentro do atribuído ao Meta,
-- quantos identificam um anúncio específico (útil pra otimização por
-- criativo, sem contaminar a leitura de "saúde geral").
--
-- Cuidado: a condição de Bio PRECISA exigir utm_content não vazio, senão
-- conta contatos sem UTM nenhuma (só com source='facebook' orgânico) como
-- "atribuídos ao Meta", o que gerou pct_match_meta > 100% numa primeira
-- tentativa (semana de 13/07: 83/80 = 103.8%) -- corrigido nesta versão.
-- ============================================================

CREATE OR REPLACE VIEW public.v_atribuicao_saude
WITH (security_invoker = true) AS
SELECT
  (date_trunc('week', o.created_at AT TIME ZONE 'America/Sao_Paulo'))::date AS semana,
  count(DISTINCT c.id) AS contatos,
  count(DISTINCT c.id) FILTER (WHERE c.utm_content IS NOT NULL AND c.utm_content <> '') AS com_utm,
  round(
    100.0 * count(DISTINCT c.id) FILTER (WHERE c.utm_content IS NOT NULL AND c.utm_content <> '')
    / NULLIF(count(DISTINCT c.id), 0),
    1
  ) AS pct_com_utm,
  count(DISTINCT c.id) FILTER (
    WHERE c.utm_content IS NOT NULL AND c.utm_content <> ''
      AND (
        c.ad_id ~ '^[0-9]{10,}$'
        OR lower(coalesce(nullif(c.utm_source, ''), nullif(c.source, ''), '')) ~ '(facebook|instagram|meta|^fb$)'
      )
  ) AS com_match_meta,
  round(
    100.0 * count(DISTINCT c.id) FILTER (
      WHERE c.utm_content IS NOT NULL AND c.utm_content <> ''
        AND (
          c.ad_id ~ '^[0-9]{10,}$'
          OR lower(coalesce(nullif(c.utm_source, ''), nullif(c.source, ''), '')) ~ '(facebook|instagram|meta|^fb$)'
        )
    )
    / NULLIF(count(DISTINCT c.id) FILTER (WHERE c.utm_content IS NOT NULL AND c.utm_content <> ''), 0),
    1
  ) AS pct_match_meta,
  count(DISTINCT c.id) FILTER (WHERE c.ad_id ~ '^[0-9]{10,}$') AS com_ad_especifico,
  round(
    100.0 * count(DISTINCT c.id) FILTER (WHERE c.ad_id ~ '^[0-9]{10,}$')
    / NULLIF(
        count(DISTINCT c.id) FILTER (
          WHERE c.utm_content IS NOT NULL AND c.utm_content <> ''
            AND (
              c.ad_id ~ '^[0-9]{10,}$'
              OR lower(coalesce(nullif(c.utm_source, ''), nullif(c.source, ''), '')) ~ '(facebook|instagram|meta|^fb$)'
            )
        ),
        0
      ),
    1
  ) AS pct_ad_especifico
FROM ghl_opportunities o
JOIN ghl_contacts c ON c.id = o.contact_id
GROUP BY (date_trunc('week', o.created_at AT TIME ZONE 'America/Sao_Paulo'))::date
ORDER BY (date_trunc('week', o.created_at AT TIME ZONE 'America/Sao_Paulo'))::date DESC;
