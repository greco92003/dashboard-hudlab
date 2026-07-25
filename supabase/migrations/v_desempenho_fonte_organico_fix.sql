-- ============================================================
-- Ajuste 2026-07-24 (aplicado no Dashboard-v2 via MCP, em duas iterações)
--
-- Achado: contatos com utm_source="Website" (valor padrão do GHL quando o
-- contato chega sem nenhum parâmetro de UTM real -- ex.: buscou no Google
-- e clicou no resultado orgânico) ou utm_source NULO, sempre com
-- source="Site - home-ghl", caíam em "Outros" em vez de "Orgânico" --
-- porque a regra original exigia utm_source E source ambos vazios, e
-- `source` (o nome da página, não um canal de verdade) sempre tinha
-- algum valor. Achado com o caso do Mateus Wentz (95 pares, R$5.690,50) e
-- outros ~6 contatos no mesmo padrão.
--
-- Primeira iteração só tratou utm_source='website' como equivalente a
-- vazio -- ainda deixava de fora contatos com utm_source NULO (Débora,
-- Eduarda Lemes). Segunda iteração (esta versão, final): "Orgânico"
-- depende só de utm_source (tratando 'website' como equivalente a vazio),
-- ignorando 'source' -- que nesse modelo de dado nunca é um canal de
-- verdade, só o nome da página. Os checks de Meta/Google/Indicação
-- continuam usando source como fallback (inalterado).
--
-- Resultado: Orgânico 5 -> 16 contatos; Outros 7 -> 1 (só um contato com
-- utm_source="SemMockup", uma tag genuinamente diferente/não reconhecida
-- de outro sistema -- corretamente deixado em Outros).
-- ============================================================

CREATE OR REPLACE VIEW public.v_desempenho_fonte
WITH (security_invoker = true) AS
WITH contatos AS (
  SELECT c.id,
    CASE
      WHEN c.ad_id ~ '^[0-9]{10,}$' THEN 'Meta Ads'
      WHEN lower(coalesce(nullif(c.utm_source, ''), nullif(c.source, ''), '')) ~ '(facebook|instagram|meta|^fb$)' THEN 'Instagram/Facebook (perfil)'
      WHEN lower(coalesce(nullif(c.utm_source, ''), nullif(c.source, ''), '')) ~ 'google' THEN 'Google Ads'
      WHEN lower(coalesce(nullif(c.utm_source, ''), nullif(c.source, ''), '')) ~ '(indica|referral)' THEN 'Indicação'
      WHEN nullif(lower(nullif(c.utm_source, '')), 'website') IS NULL THEN 'Orgânico'
      ELSE 'Outros'
    END AS fonte
  FROM ghl_contacts c
), agg AS (
  SELECT ct.fonte,
    count(*) AS leads,
    count(DISTINCT v.contact_id) AS vendas,
    coalesce(sum(v.monetary_value), 0::numeric) AS faturamento
  FROM contatos ct
  LEFT JOIN v_vendas v ON v.contact_id = ct.id
  GROUP BY ct.fonte
), spend_por_fonte AS (
  SELECT 'Meta Ads'::text AS fonte, sum(meta_insights_daily.spend) AS investimento
  FROM meta_insights_daily
)
SELECT a.fonte,
  s.investimento,
  a.leads,
  CASE WHEN s.investimento IS NOT NULL AND a.leads > 0 THEN round(s.investimento / a.leads::numeric, 2) ELSE NULL::numeric END AS cpl,
  a.vendas,
  a.faturamento,
  CASE WHEN s.investimento IS NOT NULL AND s.investimento > 0::numeric THEN round(a.faturamento / s.investimento, 2) ELSE NULL::numeric END AS roas
FROM agg a
LEFT JOIN spend_por_fonte s ON s.fonte = a.fonte
ORDER BY a.faturamento DESC;
