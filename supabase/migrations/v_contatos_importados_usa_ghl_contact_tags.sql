-- ============================================================
-- Performance de v_contatos_importados (2026-08-21)
--
-- A view identificava contato importado varrendo
-- `jsonb_array_elements_text(raw->'tags')` linha a linha em ghl_contacts.
-- Custava pouco enquanto a tabela tinha 2.720 contatos; depois que a fase
-- `contacts-all` do sync-ghl foi rodada nesta data (para fechar a cobertura
-- das etapas da régua de follow-up) ela passou a 29.823 contatos e a view
-- foi para 7,3 s -- degradando junto TUDO que depende de v_vendas, inclusive
-- os KPIs do módulo Meta (`get_resumo_periodo` foi a 5,4 s).
--
-- Agora usa a tabela normalizada ghl_contact_tags, criada no mesmo dia.
-- Equivalência verificada antes da troca: 27.620 contatos pelos dois
-- caminhos, zero diferença em qualquer direção. Nenhuma regra de negócio
-- muda.
--
-- Com o índice parcial abaixo: v_contatos_importados 7,3 s -> 1,57 s e
-- get_resumo_periodo 5,4 s -> 2,8 s.
-- ============================================================

CREATE OR REPLACE VIEW public.v_contatos_importados AS
WITH dias_rajada AS (
  SELECT (ghl_opportunities.created_at AT TIME ZONE 'America/Sao_Paulo'::text)::date AS dia
  FROM ghl_opportunities
  GROUP BY ((ghl_opportunities.created_at AT TIME ZONE 'America/Sao_Paulo'::text)::date)
  HAVING count(*) > 1000
), candidatos AS (
  SELECT DISTINCT t.contact_id
  FROM ghl_contact_tags t
  WHERE t.tag ~~* '%import%'::text
  UNION
  SELECT e.contact_id
  FROM ghl_funnel_events e
  WHERE (EXISTS ( SELECT 1
    FROM unnest(e.tags) t(t)
    WHERE t.t ~~* '%import%'::text))
  UNION
  SELECT o.contact_id
  FROM ghl_opportunities o
    LEFT JOIN ghl_contacts c ON c.id = o.contact_id
    JOIN dias_rajada ON dias_rajada.dia = (o.created_at AT TIME ZONE 'America/Sao_Paulo'::text)::date
  WHERE c.id IS NULL
  UNION
  SELECT o.contact_id
  FROM ghl_opportunities o
  WHERE (o.raw ->> 'source'::text) ~~* '%activecampaign migration%'::text
), venda_real_fora_da_rajada AS (
  SELECT DISTINCT o.contact_id
  FROM ghl_opportunities o
  WHERE o.status = 'won'::text AND o.monetary_value > 0::numeric
    AND NOT ((o.won_at AT TIME ZONE 'America/Sao_Paulo'::text)::date IN (
      SELECT dias_rajada.dia FROM dias_rajada))
)
SELECT contact_id
FROM candidatos
WHERE NOT (contact_id IN (SELECT venda_real_fora_da_rajada.contact_id FROM venda_real_fora_da_rajada));

-- O curinga à esquerda impede índice comum, então o filtro virava scan das
-- 115k linhas a cada chamada. O predicado do índice parcial é o mesmo da
-- view, o que permite index-only scan.
CREATE INDEX IF NOT EXISTS idx_ghl_contact_tags_import
  ON public.ghl_contact_tags (contact_id)
  WHERE tag ~~* '%import%';

ANALYZE public.ghl_contact_tags;
