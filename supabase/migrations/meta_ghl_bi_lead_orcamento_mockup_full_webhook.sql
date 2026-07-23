-- ============================================================
-- Ajuste 2026-07-23 (parte 2, aplicado no Dashboard-v2 via MCP)
--
-- Contexto: depois da migration meta_ghl_bi_webhook_marcos_cutover (parte 1),
-- ainda restava um gap real: leads que nascem e pedem a amostra digital em
-- minutos passam pela oportunidade do pipeline "Atendimento" só de raspão
-- antes dela ser movida pro pipeline "Fábrica de Mockups" (produção,
-- transitório) -- e nosso sync-ghl só busca oportunidades do Atendimento.
-- Resultado: 33 de 60 contatos que dispararam o webhook de mockup nos
-- últimos 7 dias (55%) não tinham NENHUMA linha em ghl_opportunities,
-- mesmo dias depois (não era atraso de sync, era ausência mesmo).
--
-- A virada: o payload do webhook JÁ carrega tudo que precisamos pra Lead,
-- Orçamento solicitado e Mockup solicitado, de forma auto-suficiente:
--   - "Utm Content" = ad_id (mesmo formato usado em ghl_contacts.utm_content)
--   - "Qntd Pares" = quantidade de pares (só confiável no evento
--     solicitoumockupoficial, não em solicitouorcamento -- ver migration
--     anterior)
--   - "Orçamento Total com Frete" / "Orçamento Subtotal" = valor do orçamento
--     (mesma limitação: só confiável no evento solicitoumockupoficial)
--   - "Estado" = UF do lead (2 letras, precisa normalizar maiúsculo e
--     descartar lixo de formulário)
-- Não há mais necessidade de esperar a oportunidade voltar da Fábrica de
-- Mockups pro Atendimento pra contar esses 3 marcos -- o gap de pipeline
-- deixou de importar pra eles.
--
-- Corte em 2026-07-16 preservado (mesma lógica da parte 1): dias antes disso
-- continuam via snapshot de pipeline (braço "legado"), congelado. A partir
-- do corte, os 3 marcos somam 100% do braço webhook (braço "legado" fica
-- zerado por definição a partir dessa data).
--
-- Negociação, Vendas, Faturamento e Pares vendidos CONTINUAM 100% pipeline,
-- inalterados nesta e na migration anterior -- essas etapas só fazem sentido
-- depois que a oportunidade volta pro Atendimento de qualquer forma.
--
-- Resultado observado: KPI "Solicitações de Mockup" (7 dias) foi de 27 -> 60,
-- batendo exatamente com o total de eventos de mockup do período.
--
-- Objetos alterados: get_funnel_por_anuncio, _kpis_periodo, v_desempenho_uf_mes.
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
  opp as (
    select
      o.id, o.contact_id, c.ad_id,
      o.status, o.created_at,
      o.monetary_value,
      coalesce(o.qty_pares, c.qty_pares) as qty_pares,
      greatest(coalesce(a.max_order, 0), coalesce(dcur.stage_order, 0)) as max_order
    from public.ghl_opportunities o
    join public.ghl_contacts c on c.id = o.contact_id
    left join alcance a on a.opportunity_id = o.id
    left join public.dim_pipeline_stages dcur on dcur.stage_id = o.stage_id
    where c.ad_id ~ '^[0-9]{10,}$'
      and (o.created_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
  ),
  pipeline_agg as (
    select
      opp.ad_id,
      count(*) filter (where opp.max_order >= m.ord_negociacao) as negociacoes,
      count(*) filter (where opp.status = 'won') as vendas,
      coalesce(sum(opp.monetary_value) filter (where opp.status = 'won'), 0) as faturamento,
      sum(opp.qty_pares) filter (where opp.status = 'won') as pares_vendidos,
      count(*) filter (where opp.created_at < now() - interval '35 days') as leads_maduros,
      count(*) filter (where opp.created_at < now() - interval '35 days' and opp.status = 'won') as vendas_maduras
    from opp, marcos m
    group by opp.ad_id
  ),
  legado_agg as (
    select
      opp.ad_id,
      count(*) as leads_legado,
      count(*) filter (where opp.max_order >= m.ord_orcamento) as orcamentos_legado,
      coalesce(sum(opp.monetary_value) filter (where opp.max_order >= m.ord_orcamento), 0) as valor_orcamentos_legado,
      sum(opp.qty_pares) filter (where opp.max_order >= m.ord_orcamento) as pares_orcamentos_legado,
      count(*) filter (where opp.max_order >= m.ord_mockup) as mockups_legado
    from opp, marcos m
    where (opp.created_at at time zone 'America/Sao_Paulo')::date < date '2026-07-16'
    group by opp.ad_id
  ),
  webhook_eventos as (
    select
      e.stage_slug,
      nullif(e.raw_payload->>'Utm Content', '') as ad_id,
      e.quantidade_pares,
      coalesce(
        nullif(e.raw_payload->>'Orçamento Total com Frete', '')::numeric,
        nullif(e.raw_payload->>'Orçamento Subtotal', '')::numeric
      ) as valor_orcamento
    from public.ghl_funnel_events e
    where (e.received_at at time zone 'America/Sao_Paulo')::date >= date '2026-07-16'
      and (e.received_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
  ),
  webhook_agg as (
    select
      ad_id,
      count(*) filter (where stage_slug = 'lead') as leads_webhook,
      count(*) filter (where stage_slug = 'solicitouorcamento') as orcamentos_webhook,
      coalesce(sum(valor_orcamento) filter (where stage_slug = 'solicitoumockupoficial'), 0) as valor_orcamentos_webhook,
      sum(quantidade_pares) filter (where stage_slug = 'solicitoumockupoficial') as pares_orcamentos_webhook,
      count(*) filter (where stage_slug = 'solicitoumockupoficial') as mockups_webhook
    from webhook_eventos
    where ad_id ~ '^[0-9]{10,}$'
    group by ad_id
  ),
  meta as (
    select ad_id, max(ad_name) as ad_name, max(campaign_name) as campaign_name,
           sum(spend) as spend_total, sum(impressions) as impressoes,
           sum(clicks) as cliques, sum(leads) as leads_meta
    from public.meta_insights_daily
    where date between p_inicio and p_fim
    group by ad_id
  ),
  todos_ad_ids as (
    select ad_id from meta
    union select ad_id from pipeline_agg
    union select ad_id from legado_agg
    union select ad_id from webhook_agg
  ),
  ghl as (
    select
      t.ad_id,
      coalesce(l.leads_legado, 0) + coalesce(w.leads_webhook, 0) as leads_ghl,
      coalesce(l.orcamentos_legado, 0) + coalesce(w.orcamentos_webhook, 0) as orcamentos,
      coalesce(l.valor_orcamentos_legado, 0) + coalesce(w.valor_orcamentos_webhook, 0) as valor_orcamentos,
      coalesce(l.pares_orcamentos_legado, 0) + coalesce(w.pares_orcamentos_webhook, 0) as pares_orcamentos,
      coalesce(l.mockups_legado, 0) + coalesce(w.mockups_webhook, 0) as mockups,
      coalesce(p.negociacoes, 0) as negociacoes,
      coalesce(p.vendas, 0) as vendas,
      coalesce(p.faturamento, 0) as faturamento,
      p.pares_vendidos,
      coalesce(p.leads_maduros, 0) as leads_maduros,
      coalesce(p.vendas_maduras, 0) as vendas_maduras
    from todos_ad_ids t
    left join pipeline_agg p on p.ad_id = t.ad_id
    left join legado_agg l on l.ad_id = t.ad_id
    left join webhook_agg w on w.ad_id = t.ad_id
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
-- _kpis_periodo: mesma soma legado+webhook pros KPIs "Leads" e
-- "Solicitações de Mockup" da Visão Geral.
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
  v_leads_legado bigint;
  v_leads_webhook bigint;
  v_vendas bigint;
  v_faturamento numeric;
  v_pares bigint;
  v_mockups bigint;
  v_mockups_legado bigint;
  v_mockups_webhook bigint;
  v_ord_mockup int;
begin
  select coalesce(sum(spend), 0), coalesce(sum(impressions), 0), coalesce(sum(clicks), 0)
    into v_spend, v_impressoes, v_cliques
  from public.meta_insights_daily
  where date between p_inicio and p_fim;

  select stage_order into v_ord_mockup
  from public.dim_pipeline_stages where stage_name = 'Amostra Digital Enviada';

  select count(*) into v_leads_legado
  from public.ghl_opportunities o
  where (o.created_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
    and (o.created_at at time zone 'America/Sao_Paulo')::date < date '2026-07-16';

  select count(*) into v_mockups_legado
  from public.ghl_opportunities o
  where (o.created_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
    and (o.created_at at time zone 'America/Sao_Paulo')::date < date '2026-07-16'
    and greatest(
          coalesce((select max(coalesce(d.stage_order, 0))
                    from public.ghl_stage_snapshots s
                    left join public.dim_pipeline_stages d on d.stage_id = s.stage_id
                    where s.opportunity_id = o.id), 0),
          coalesce((select stage_order from public.dim_pipeline_stages where stage_id = o.stage_id), 0)
        ) >= v_ord_mockup;

  select
    count(*) filter (where e.stage_slug = 'lead'),
    count(*) filter (where e.stage_slug = 'solicitoumockupoficial')
    into v_leads_webhook, v_mockups_webhook
  from public.ghl_funnel_events e
  where (e.received_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
    and (e.received_at at time zone 'America/Sao_Paulo')::date >= date '2026-07-16';

  v_leads := coalesce(v_leads_legado, 0) + coalesce(v_leads_webhook, 0);
  v_mockups := coalesce(v_mockups_legado, 0) + coalesce(v_mockups_webhook, 0);

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
-- v_desempenho_uf_mes: mesma soma legado+webhook pra coluna "mockups".
-- UF do braço webhook vem do campo "Estado" do próprio payload.
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
    o.created_at
  FROM ghl_opportunities o
  JOIN ghl_contacts c ON c.id = o.contact_id
  LEFT JOIN alcance a ON a.opportunity_id = o.id
  LEFT JOIN dim_pipeline_stages dcur ON dcur.stage_id = o.stage_id
  WHERE c.uf IS NOT NULL
),
legado_uf AS (
  SELECT opp.uf, opp.mes,
    count(DISTINCT opp.contact_id) AS leads_ghl,
    count(*) FILTER (WHERE opp.max_order >= m.ord_mockup) AS mockups_legado
  FROM opp, marcos m
  WHERE (opp.created_at AT TIME ZONE 'America/Sao_Paulo')::date < date '2026-07-16'
  GROUP BY opp.uf, opp.mes
),
webhook_uf AS (
  SELECT
    (upper(nullif(e.raw_payload->>'Estado', '')))::character(2) AS uf,
    (date_trunc('month', e.received_at AT TIME ZONE 'America/Sao_Paulo'))::date AS mes,
    count(*) AS mockups_webhook
  FROM ghl_funnel_events e
  WHERE e.stage_slug = 'solicitoumockupoficial'
    AND (e.received_at AT TIME ZONE 'America/Sao_Paulo')::date >= date '2026-07-16'
    AND length(upper(nullif(e.raw_payload->>'Estado', ''))) = 2
  GROUP BY 1, 2
),
ghl_uf AS (
  SELECT
    coalesce(lu.uf, wu.uf) AS uf,
    coalesce(lu.mes, wu.mes) AS mes,
    coalesce(lu.leads_ghl, 0) AS leads_ghl,
    coalesce(lu.mockups_legado, 0) + coalesce(wu.mockups_webhook, 0) AS mockups
  FROM legado_uf lu
  FULL JOIN webhook_uf wu ON wu.uf = lu.uf AND wu.mes = lu.mes
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
