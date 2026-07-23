-- ============================================================
-- Corte de fonte de dado por marco (2026-07-23, aplicado no Dashboard-v2 via MCP)
--
-- Contexto: "/funil" (app/api/webhooks/ghl/funnel/route.ts -> ghl_funnel_events)
-- é um sistema separado, webhook-driven, que capta em tempo real ações do
-- CLIENTE (solicitou orçamento, solicitou mockup oficial). O módulo Meta x GHL
-- usava só snapshot de pipeline (ghl_stage_snapshots), que reflete quando NÓS
-- movemos o card — para marcos que dependem de uma ação nossa (ex.: enviar a
-- amostra digital) isso criava um atraso sistemático medido em ~62h entre a
-- solicitação real do cliente e o momento em que nosso sync capturava o marco.
--
-- Regra acordada com o usuário: a fonte do dado depende de QUEM aciona o marco.
--   - Orçamento solicitado, Mockup solicitado: ação do CLIENTE -> webhook.
--   - Negociação, Vendas/Faturamento, Pares vendidos: ação NOSSA ou dado já
--     consolidado (usado no ROAS final) -> pipeline, sem mudança.
--   - Pares orçados: o webhook só carrega quantidade_pares de forma confiável
--     no evento "solicitoumockupoficial" (66/66 eventos), não em
--     "solicitouorcamento" (1/123) — por isso a quantidade vem desse evento.
--
-- Corte por DATA DE CRIAÇÃO da oportunidade (coorte), não por registro:
--   - Leads criados ANTES de 2026-07-16: mantêm 100% a leitura via snapshot de
--     pipeline, congelada (ghl_funnel_events só existe a partir de 15/07, e
--     15/07 é dia de rampa parcial - 1 evento de orçamento, 0 de mockup).
--   - Leads criados a partir de 2026-07-16 (primeiro dia com volume completo):
--     usam 100% webhook para orçamento/mockup/pares orçados, sem fallback.
--     Se o webhook não tiver o evento (contato ainda não sincronizado em
--     ghl_contacts, ou evento perdido), o marco NÃO é contado — trade-off
--     aceito explicitamente pelo usuário em vez de COALESCE por registro.
--
-- Ressalva: mesmo após a troca, o KPI "Solicitações de Mockup" não bate 1:1
-- com "/funil" — este módulo conta coorte (lead criado no período que em
-- algum momento alcançou o marco), "/funil" conta eventos ocorridos numa
-- janela de dias. São perguntas diferentes por design; a troca elimina o
-- atraso de fonte, não a diferença metodológica de contagem.
--
-- Objetos alterados: get_funnel_por_anuncio, _kpis_periodo, v_desempenho_uf_mes.
-- v_funnel_por_anuncio (all-time, sem uso direto no frontend) ficou de fora.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_funnel_por_anuncio(p_inicio date, p_fim date)
 RETURNS TABLE(ad_id text, ad_name text, campaign_name text, spend_total numeric, impressoes bigint, cliques bigint, leads_meta numeric, cpl_meta numeric, leads_ghl bigint, orcamentos bigint, valor_orcamentos numeric, pares_orcamentos bigint, mockups bigint, negociacoes bigint, vendas bigint, faturamento numeric, pares_vendidos bigint, custo_por_lead numeric, custo_por_orcamento numeric, custo_por_mockup numeric, custo_por_negociacao numeric, cpa_venda numeric, taxa_conversao_lead_venda numeric, roas numeric, diagnostico text)
 LANGUAGE sql
 STABLE
AS $function$
  with marcos as (
    select
      (select stage_order from public.dim_pipeline_stages where stage_name = 'Orçamento Gerado') as ord_orcamento,
      (select stage_order from public.dim_pipeline_stages where stage_name = 'Amostra Digital Enviada') as ord_mockup,
      (select stage_order from public.dim_pipeline_stages where stage_name = 'Negociação') as ord_negociacao
  ),
  alcance as (
    select s.opportunity_id, max(coalesce(d.stage_order, 0)) as max_order
    from public.ghl_stage_snapshots s
    left join public.dim_pipeline_stages d on d.stage_id = s.stage_id
    group by s.opportunity_id
  ),
  webhook_marcos as (
    select
      e.contact_id,
      min(e.received_at) filter (where e.stage_slug = 'solicitouorcamento') as orcamento_em,
      min(e.received_at) filter (where e.stage_slug = 'solicitoumockupoficial') as mockup_em,
      max(e.quantidade_pares) filter (where e.stage_slug = 'solicitoumockupoficial') as pares_orcados_webhook
    from public.ghl_funnel_events e
    group by e.contact_id
  ),
  opp as (
    select
      o.id, o.contact_id, c.ad_id,
      o.status, o.created_at,
      o.monetary_value,
      coalesce(o.qty_pares, c.qty_pares) as qty_pares,
      greatest(coalesce(a.max_order, 0), coalesce(dcur.stage_order, 0)) as max_order,
      case
        when (o.created_at at time zone 'America/Sao_Paulo')::date >= date '2026-07-16'
          then w.orcamento_em is not null
        else greatest(coalesce(a.max_order, 0), coalesce(dcur.stage_order, 0)) >= m.ord_orcamento
      end as reached_orcamento,
      case
        when (o.created_at at time zone 'America/Sao_Paulo')::date >= date '2026-07-16'
          then w.mockup_em is not null
        else greatest(coalesce(a.max_order, 0), coalesce(dcur.stage_order, 0)) >= m.ord_mockup
      end as reached_mockup,
      case
        when (o.created_at at time zone 'America/Sao_Paulo')::date >= date '2026-07-16'
          then w.pares_orcados_webhook
        else coalesce(o.qty_pares, c.qty_pares)
      end as pares_orcamentos_valor
    from public.ghl_opportunities o
    join public.ghl_contacts c on c.id = o.contact_id
    left join alcance a on a.opportunity_id = o.id
    left join public.dim_pipeline_stages dcur on dcur.stage_id = o.stage_id
    left join webhook_marcos w on w.contact_id = o.contact_id
    cross join marcos m
    where c.ad_id ~ '^[0-9]{10,}$'
      and (o.created_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
  ),
  ghl as (
    select
      opp.ad_id,
      count(distinct opp.contact_id) as leads_ghl,
      count(*) filter (where opp.reached_orcamento) as orcamentos,
      coalesce(sum(opp.monetary_value) filter (where opp.reached_orcamento), 0) as valor_orcamentos,
      sum(opp.pares_orcamentos_valor) filter (where opp.reached_orcamento) as pares_orcamentos,
      count(*) filter (where opp.reached_mockup) as mockups,
      count(*) filter (where opp.max_order >= m.ord_negociacao) as negociacoes,
      count(*) filter (where opp.status = 'won') as vendas,
      coalesce(sum(opp.monetary_value) filter (where opp.status = 'won'), 0) as faturamento,
      sum(opp.qty_pares) filter (where opp.status = 'won') as pares_vendidos,
      count(*) filter (where opp.created_at < now() - interval '35 days') as leads_maduros,
      count(*) filter (where opp.created_at < now() - interval '35 days' and opp.status = 'won') as vendas_maduras
    from opp, marcos m
    group by opp.ad_id
  ),
  meta as (
    select ad_id, max(ad_name) as ad_name, max(campaign_name) as campaign_name,
           sum(spend) as spend_total, sum(impressions) as impressoes,
           sum(clicks) as cliques, sum(leads) as leads_meta
    from public.meta_insights_daily
    where date between p_inicio and p_fim
    group by ad_id
  ),
  thresholds as (
    select 2.0::numeric as roas_bom, 10::bigint as min_leads, 5.0::numeric as conv_minima
  )
  select
    coalesce(m.ad_id, g.ad_id) as ad_id,
    m.ad_name,
    m.campaign_name,
    coalesce(m.spend_total, 0) as spend_total,
    m.impressoes,
    m.cliques,
    m.leads_meta,
    case when m.leads_meta > 0 then round(m.spend_total / m.leads_meta, 2) end as cpl_meta,
    coalesce(g.leads_ghl, 0) as leads_ghl,
    coalesce(g.orcamentos, 0) as orcamentos,
    coalesce(g.valor_orcamentos, 0) as valor_orcamentos,
    g.pares_orcamentos,
    coalesce(g.mockups, 0) as mockups,
    coalesce(g.negociacoes, 0) as negociacoes,
    coalesce(g.vendas, 0) as vendas,
    coalesce(g.faturamento, 0) as faturamento,
    g.pares_vendidos,
    case when coalesce(g.leads_ghl, 0) > 0 then round(m.spend_total / g.leads_ghl, 2) end as custo_por_lead,
    case when coalesce(g.orcamentos, 0) > 0 then round(m.spend_total / g.orcamentos, 2) end as custo_por_orcamento,
    case when coalesce(g.mockups, 0) > 0 then round(m.spend_total / g.mockups, 2) end as custo_por_mockup,
    case when coalesce(g.negociacoes, 0) > 0 then round(m.spend_total / g.negociacoes, 2) end as custo_por_negociacao,
    case when coalesce(g.vendas, 0) > 0 then round(m.spend_total / g.vendas, 2) end as cpa_venda,
    case when coalesce(g.leads_ghl, 0) > 0
         then round(100.0 * coalesce(g.vendas, 0) / g.leads_ghl, 2) end as taxa_conversao_lead_venda,
    case when coalesce(m.spend_total, 0) > 0
         then round(coalesce(g.faturamento, 0) / m.spend_total, 2) end as roas,
    case
      when coalesce(m.spend_total, 0) > 0
           and coalesce(g.faturamento, 0) / m.spend_total >= (select roas_bom from thresholds)
        then 'GERA VENDA'
      when coalesce(g.leads_maduros, 0) >= (select min_leads from thresholds)
           and 100.0 * coalesce(g.vendas_maduras, 0) / g.leads_maduros < (select conv_minima from thresholds)
        then 'LEAD BARATO VENDA CARA'
      else 'REVISAR'
    end as diagnostico
  from meta m
  full outer join ghl g on g.ad_id = m.ad_id;
$function$;

-- ------------------------------------------------------------
-- _kpis_periodo: mesma regra de corte aplicada ao KPI "Solicitações de
-- Mockup" da Visão Geral (não expõe orçamento/pares orçados neste nível).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._kpis_periodo(p_inicio date, p_fim date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_spend numeric;
  v_impressoes bigint;
  v_cliques bigint;
  v_leads bigint;
  v_vendas bigint;
  v_faturamento numeric;
  v_pares bigint;
  v_mockups bigint;
  v_ord_mockup int;
begin
  select coalesce(sum(spend), 0), coalesce(sum(impressions), 0), coalesce(sum(clicks), 0)
    into v_spend, v_impressoes, v_cliques
  from public.meta_insights_daily
  where date between p_inicio and p_fim;

  select stage_order into v_ord_mockup
  from public.dim_pipeline_stages where stage_name = 'Amostra Digital Enviada';

  select count(*) into v_leads
  from public.ghl_opportunities o
  where (o.created_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim;

  select count(*) into v_mockups
  from public.ghl_opportunities o
  where (o.created_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
    and (
      case
        when (o.created_at at time zone 'America/Sao_Paulo')::date >= date '2026-07-16'
          then exists (
            select 1 from public.ghl_funnel_events e
            where e.contact_id = o.contact_id and e.stage_slug = 'solicitoumockupoficial'
          )
        else greatest(
              coalesce((select max(coalesce(d.stage_order, 0))
                        from public.ghl_stage_snapshots s
                        left join public.dim_pipeline_stages d on d.stage_id = s.stage_id
                        where s.opportunity_id = o.id), 0),
              coalesce((select stage_order from public.dim_pipeline_stages where stage_id = o.stage_id), 0)
            ) >= v_ord_mockup
      end
    );

  select count(distinct v.contact_id), coalesce(sum(v.monetary_value), 0), sum(v.qty_pares)
    into v_vendas, v_faturamento, v_pares
  from public.v_vendas v
  where (v.venda_em at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim;

  return jsonb_build_object(
    'spend', v_spend,
    'impressoes', v_impressoes,
    'cliques', v_cliques,
    'leads', v_leads,
    'vendas', v_vendas,
    'faturamento', v_faturamento,
    'roas', case when v_spend > 0 then round(v_faturamento / v_spend, 2) end,
    'cpa_pedido', case when v_vendas > 0 then round(v_spend / v_vendas, 2) end,
    'cpl', case when v_leads > 0 then round(v_spend / v_leads, 2) end,
    'ctr', case when v_impressoes > 0 then round(100.0 * v_cliques / v_impressoes, 2) end,
    'cpc', case when v_cliques > 0 then round(v_spend / v_cliques, 2) end,
    'pares_vendidos', v_pares,
    'ticket_medio_par', case when v_pares > 0 then round(v_faturamento / v_pares, 2) end,
    'custo_por_par', case when v_pares > 0 then round(v_spend / v_pares, 2) end,
    'mockups', v_mockups,
    'custo_por_mockup', case when v_mockups > 0 then round(v_spend / v_mockups, 2) end
  );
end;
$function$;

-- ------------------------------------------------------------
-- v_desempenho_uf_mes: mesma regra de corte aplicada à coluna "mockups"
-- (aba Regiões). Lista de colunas de saída inalterada.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_desempenho_uf_mes AS
WITH marcos AS (
  SELECT (SELECT stage_order FROM dim_pipeline_stages WHERE stage_name = 'Amostra Digital Enviada') AS ord_mockup
),
alcance AS (
  SELECT s.opportunity_id, max(coalesce(d.stage_order, 0)) AS max_order
  FROM ghl_stage_snapshots s
  LEFT JOIN dim_pipeline_stages d ON d.stage_id = s.stage_id
  GROUP BY s.opportunity_id
),
webhook_marcos AS (
  SELECT e.contact_id,
    min(e.received_at) FILTER (WHERE e.stage_slug = 'solicitoumockupoficial') AS mockup_em
  FROM ghl_funnel_events e
  GROUP BY e.contact_id
),
meta_uf AS (
  SELECT meta_insights_daily.uf,
    (date_trunc('month', meta_insights_daily.date::timestamp with time zone))::date AS mes,
    sum(meta_insights_daily.spend) AS spend,
    sum(meta_insights_daily.leads) AS leads_meta
  FROM meta_insights_daily
  WHERE meta_insights_daily.uf IS NOT NULL
  GROUP BY meta_insights_daily.uf, (date_trunc('month', meta_insights_daily.date::timestamp with time zone))
),
opp AS (
  SELECT o.id, o.contact_id, c.uf,
    (date_trunc('month', o.created_at AT TIME ZONE 'America/Sao_Paulo'))::date AS mes,
    GREATEST(coalesce(a.max_order, 0), coalesce(dcur.stage_order, 0)) AS max_order,
    CASE
      WHEN (o.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= date '2026-07-16'
        THEN w.mockup_em IS NOT NULL
      ELSE GREATEST(coalesce(a.max_order, 0), coalesce(dcur.stage_order, 0)) >= (SELECT ord_mockup FROM marcos)
    END AS reached_mockup
  FROM ghl_opportunities o
  JOIN ghl_contacts c ON c.id = o.contact_id
  LEFT JOIN alcance a ON a.opportunity_id = o.id
  LEFT JOIN dim_pipeline_stages dcur ON dcur.stage_id = o.stage_id
  LEFT JOIN webhook_marcos w ON w.contact_id = o.contact_id
  WHERE c.uf IS NOT NULL
),
ghl_uf AS (
  SELECT opp.uf, opp.mes,
    count(DISTINCT opp.contact_id) AS leads_ghl,
    count(*) FILTER (WHERE opp.reached_mockup) AS mockups
  FROM opp
  GROUP BY opp.uf, opp.mes
),
vendas_uf AS (
  SELECT c.uf,
    (date_trunc('month', o.created_at AT TIME ZONE 'America/Sao_Paulo'))::date AS mes,
    count(DISTINCT v.contact_id) AS vendas,
    coalesce(sum(v.monetary_value), 0::numeric) AS faturamento
  FROM ghl_opportunities o
  JOIN ghl_contacts c ON c.id = o.contact_id
  LEFT JOIN v_vendas v ON v.contact_id = c.id
  WHERE c.uf IS NOT NULL
  GROUP BY c.uf, (date_trunc('month', o.created_at AT TIME ZONE 'America/Sao_Paulo'))
)
SELECT coalesce(m.uf, g.uf, ve.uf) AS uf,
  d.region_group,
  coalesce(m.mes, g.mes, ve.mes) AS mes,
  estacao_do_mes(EXTRACT(month FROM coalesce(m.mes, g.mes, ve.mes))::integer) AS estacao,
  coalesce(m.spend, 0::numeric) AS spend,
  coalesce(m.leads_meta, 0::numeric) AS leads_meta,
  coalesce(g.leads_ghl, 0::bigint) AS leads_ghl,
  coalesce(g.mockups, 0::bigint) AS mockups,
  coalesce(ve.vendas, 0::bigint) AS vendas,
  coalesce(ve.faturamento, 0::numeric) AS faturamento
FROM meta_uf m
FULL JOIN ghl_uf g ON g.uf = m.uf AND g.mes = m.mes
FULL JOIN vendas_uf ve ON ve.uf = coalesce(m.uf, g.uf) AND ve.mes = coalesce(m.mes, g.mes)
LEFT JOIN dim_region_group d ON d.uf = coalesce(m.uf, g.uf, ve.uf);
