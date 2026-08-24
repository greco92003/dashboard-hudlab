-- ============================================================
-- Cascata das réguas de follow-up automatizado do GHL (2026-08-21)
--
-- Atendimento (D1/D3/D7): a métrica é UMA só -- avanço para Negociação.
-- Nada de venda/receita aqui: o fechamento está longe demais dessa etapa.
--
-- Negociação (M1/M2/M3): avanço para Prioridade de Fechamento, Finalizando
-- Venda ou ganho, mais o faturamento atribuído -- essa é a métrica final da
-- promoção.
--
-- ATRIBUIÇÃO SEM TIMESTAMP DE TAG: como qualquer avanço interrompe os
-- disparos seguintes da régua, a ÚLTIMA tag que o contato tem é
-- necessariamente a mensagem que estava valendo quando ele destravou. Por
-- isso o denominador de cada degrau já é a base certa (D3 só é enviada a
-- quem não destravou na D1) e as taxas são comparáveis entre si.
--
-- DESTRAVOU = esteve na etapa adiante DEPOIS da última vez que foi visto na
-- etapa de origem, medido contra a foto diária `ghl_stage_snapshots`. A
-- primeira versão usava a maior etapa já alcançada e contava como destravado
-- quem passou por Negociação antes da mensagem e depois voltou: 98 pela
-- regra antiga contra 88 pela nova, ou seja 10 contatos que seguem na fila.
-- A granularidade é o dia, o que basta para uma régua de D1/D3/D7 e para
-- promoções semanais.
--
-- FATURAMENTO vem de `v_vendas`, a fonte canônica: aplica a sanidade de
-- `dado_par_plausivel` e exclui contatos importados -- mas com a saída
-- `venda_real_fora_da_rajada`, que devolve à contagem o contato migrado que
-- compra de verdade. Ou seja, venda gerada pela promo aparece normalmente,
-- mesmo o público sendo majoritariamente backlog migrado.
--
-- VERSIONAMENTO: a versão sai do sufixo `_v2`; tag sem sufixo é v1. Copy
-- nova aparece sozinha na tela, sem mexer em código. As tags reais em
-- produção são `follow_atendimento_d1` e `follow_negociacao_m1` -- NÃO as
-- `AT-D1-FEEDBACK-V1` do documento de especificação.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_followup_regua()
RETURNS TABLE (
  bloco TEXT,
  degrau INT,
  versao INT,
  rotulo TEXT,
  receberam BIGINT,
  destravaram BIGINT,
  vendas BIGINT,
  faturamento NUMERIC,
  valor_em_negociacao NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH tags AS (
    SELECT
      t.contact_id,
      CASE WHEN t.tag ~ '^follow_atendimento_d\d+(_v\d+)?$' THEN 'atendimento'
           ELSE 'negociacao' END AS bloco,
      (regexp_match(t.tag, '_(?:d|m)(\d+)(?:_v\d+)?$'))[1]::INT AS degrau,
      COALESCE((regexp_match(t.tag, '_v(\d+)$'))[1]::INT, 1) AS versao
    FROM public.ghl_contact_tags t
    WHERE t.tag ~ '^follow_(atendimento_d|negociacao_m)\d+(_v\d+)?$'
  ),
  ultimo AS (
    SELECT DISTINCT ON (contact_id, bloco)
      contact_id, bloco, degrau, versao
    FROM tags
    ORDER BY contact_id, bloco, degrau DESC, versao DESC
  ),
  snap AS (
    SELECT o.contact_id, s.snapshot_date, MAX(dd.stage_order) AS ordem
    FROM public.ghl_stage_snapshots s
    JOIN public.ghl_opportunities o ON o.id = s.opportunity_id
    JOIN public.dim_pipeline_stages dd
      ON dd.pipeline_id = s.pipeline_id AND dd.stage_name = s.stage_name
    GROUP BY 1, 2
  ),
  jornada AS (
    SELECT
      contact_id,
      MAX(snapshot_date) FILTER (WHERE ordem = 4) AS ultimo_dia_atendimento,
      MAX(snapshot_date) FILTER (WHERE ordem >= 5) AS ultimo_dia_negociacao_ou_alem,
      MAX(snapshot_date) FILTER (WHERE ordem = 5) AS ultimo_dia_negociacao,
      MAX(snapshot_date) FILTER (WHERE ordem >= 6) AS ultimo_dia_prioridade_ou_alem
    FROM snap
    GROUP BY 1
  ),
  negocio AS (
    SELECT
      o.contact_id,
      MAX((o.status = 'won')::INT) AS ganhou,
      SUM(o.monetary_value) FILTER (WHERE o.status <> 'won') AS valor_aberto
    FROM public.ghl_opportunities o
    WHERE o.pipeline_id IN (SELECT DISTINCT pipeline_id FROM public.dim_pipeline_stages)
    GROUP BY 1
  ),
  venda AS (
    SELECT contact_id, SUM(monetary_value) AS faturamento, COUNT(*) AS vendas
    FROM public.v_vendas
    GROUP BY 1
  ),
  atribuido AS (
    SELECT
      tg.bloco, tg.degrau, tg.versao, tg.contact_id,
      (u.degrau = tg.degrau AND u.versao = tg.versao) AS e_o_ultimo,
      CASE
        WHEN tg.bloco = 'atendimento' THEN
          j.ultimo_dia_negociacao_ou_alem IS NOT NULL
          AND (j.ultimo_dia_atendimento IS NULL
               OR j.ultimo_dia_negociacao_ou_alem > j.ultimo_dia_atendimento)
        ELSE
          COALESCE(n.ganhou, 0) = 1
          OR (j.ultimo_dia_prioridade_ou_alem IS NOT NULL
              AND (j.ultimo_dia_negociacao IS NULL
                   OR j.ultimo_dia_prioridade_ou_alem > j.ultimo_dia_negociacao))
      END AS destravou,
      v.vendas, v.faturamento, n.valor_aberto
    FROM tags tg
    JOIN ultimo u ON u.contact_id = tg.contact_id AND u.bloco = tg.bloco
    LEFT JOIN jornada j ON j.contact_id = tg.contact_id
    LEFT JOIN negocio n ON n.contact_id = tg.contact_id
    LEFT JOIN venda v ON v.contact_id = tg.contact_id
  )
  SELECT
    a.bloco,
    a.degrau,
    a.versao,
    CASE WHEN a.bloco = 'atendimento' THEN 'D' ELSE 'M' END || a.degrau
      || CASE WHEN a.versao > 1 THEN ' V' || a.versao ELSE '' END AS rotulo,
    COUNT(*) AS receberam,
    COUNT(*) FILTER (WHERE a.e_o_ultimo AND a.destravou) AS destravaram,
    CASE WHEN a.bloco = 'negociacao'
      THEN COALESCE(SUM(a.vendas) FILTER (WHERE a.e_o_ultimo), 0) END AS vendas,
    CASE WHEN a.bloco = 'negociacao'
      THEN COALESCE(SUM(a.faturamento) FILTER (WHERE a.e_o_ultimo), 0) END AS faturamento,
    CASE WHEN a.bloco = 'negociacao'
      THEN COALESCE(SUM(a.valor_aberto) FILTER (WHERE a.e_o_ultimo), 0) END AS valor_em_negociacao
  FROM atribuido a
  GROUP BY a.bloco, a.degrau, a.versao
  ORDER BY a.bloco DESC, a.degrau, a.versao;
$$;

GRANT EXECUTE ON FUNCTION public.get_followup_regua() TO authenticated;
