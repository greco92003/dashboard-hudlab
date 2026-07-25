-- ============================================================
-- Ajuste 2026-07-25 (aplicado no Dashboard-v2 via MCP, consolidando
-- meta_ghl_bi_funil_etapas_exclui_importados +
-- meta_ghl_bi_funil_etapas_exclui_importados_view +
-- meta_ghl_bi_kpis_periodo_exclui_importados)
--
-- Mesmo ajuste de meta_ghl_bi_exclui_importados_get_funnel_por_anuncio.sql
-- (exclui public.v_contatos_importados), aplicado em get_funil_etapas
-- (widget "Funil de vendas"/"Custo por etapa" da Visão Geral) e em
-- _kpis_periodo (KPIs "Leads" e "Solicitações de Mockup" da Visão Geral).
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_funil_etapas(p_inicio date, p_fim date)
 RETURNS TABLE(
   pipeline_id text,
   stage_id text,
   stage_name text,
   stage_order int,
   qtd bigint,
   custo_por_oportunidade numeric,
   pct_primeira_etapa numeric,
   pct_etapa_anterior numeric
 )
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
      o.id, o.created_at,
      greatest(coalesce(a.max_order, 0), coalesce(dcur.stage_order, 0)) as max_order
    from public.ghl_opportunities o
    left join alcance a on a.opportunity_id = o.id
    left join public.dim_pipeline_stages dcur on dcur.stage_id = o.stage_id
    where (o.created_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
      and o.contact_id not in (select contact_id from public.v_contatos_importados)
  ),
  legado as (
    select
      count(*) filter (where opp.max_order >= m.ord_orcamento) as orcamentos,
      count(*) filter (where opp.max_order >= m.ord_mockup) as mockups,
      count(*) filter (where opp.max_order >= m.ord_negociacao) as negociacoes
    from opp, marcos m
    where (opp.created_at at time zone 'America/Sao_Paulo')::date < date '2026-07-16'
  ),
  webhook as (
    select
      count(*) filter (where e.stage_slug = 'solicitouorcamento') as orcamentos,
      count(*) filter (where e.stage_slug = 'solicitoumockupoficial') as mockups,
      count(*) filter (where e.stage_slug = 'emnegociacao') as negociacoes
    from public.ghl_funnel_events e
    where (e.received_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
      and (e.received_at at time zone 'America/Sao_Paulo')::date >= date '2026-07-16'
      and e.contact_id not in (select contact_id from public.v_contatos_importados)
  ),
  spend as (
    select coalesce(sum(spend), 0) as total from public.meta_insights_daily where date between p_inicio and p_fim
  ),
  base_pipeline as (
    select
      d.pipeline_id, d.stage_id, d.stage_name, d.stage_order,
      (select count(*) from opp where opp.max_order >= d.stage_order) as qtd
    from public.dim_pipeline_stages d
    where d.is_funil
      and d.stage_name not in ('Orçamento Gerado', 'Amostra Digital Enviada', 'Atendimento', 'Negociação')
  ),
  base_orcamento as (
    select d.pipeline_id, d.stage_id, d.stage_name, d.stage_order,
      (select orcamentos from legado) + (select orcamentos from webhook) as qtd
    from public.dim_pipeline_stages d
    where d.stage_name = 'Orçamento Gerado'
  ),
  base_mockup as (
    select d.pipeline_id, d.stage_id, 'Solicitação de Mockup'::text as stage_name, d.stage_order,
      (select mockups from legado) + (select mockups from webhook) as qtd
    from public.dim_pipeline_stages d
    where d.stage_name = 'Amostra Digital Enviada'
  ),
  base_negociacao as (
    select d.pipeline_id, d.stage_id, d.stage_name, d.stage_order,
      (select negociacoes from legado) + (select negociacoes from webhook) as qtd
    from public.dim_pipeline_stages d
    where d.stage_name = 'Negociação'
  ),
  todas as (
    select * from base_pipeline
    union all select * from base_orcamento
    union all select * from base_mockup
    union all select * from base_negociacao
  )
  select
    t.pipeline_id, t.stage_id, t.stage_name, t.stage_order, t.qtd,
    case when t.qtd > 0 then round((select total from spend) / t.qtd, 2) else null end as custo_por_oportunidade,
    round(100.0 * t.qtd / nullif(first_value(t.qtd) over w, 0), 1) as pct_primeira_etapa,
    round(100.0 * t.qtd / nullif(lag(t.qtd) over w, 0), 1) as pct_etapa_anterior
  from todas t
  window w as (partition by t.pipeline_id order by t.stage_order)
  order by t.pipeline_id, t.stage_order;
$function$;

-- ------------------------------------------------------------
-- _kpis_periodo: mesmo ajuste.
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

  select count(*) into v_leads
  from public.ghl_opportunities o
  where (o.created_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
    and o.contact_id not in (select contact_id from public.v_contatos_importados);

  select count(*) into v_mockups_legado
  from public.ghl_opportunities o
  where (o.created_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
    and (o.created_at at time zone 'America/Sao_Paulo')::date < date '2026-07-16'
    and o.contact_id not in (select contact_id from public.v_contatos_importados)
    and greatest(
          coalesce((select max(coalesce(d.stage_order, 0))
                    from public.ghl_stage_snapshots s
                    left join public.dim_pipeline_stages d on d.stage_id = s.stage_id
                    where s.opportunity_id = o.id), 0),
          coalesce((select stage_order from public.dim_pipeline_stages where stage_id = o.stage_id), 0)
        ) >= v_ord_mockup;

  select count(*) filter (where e.stage_slug = 'solicitoumockupoficial')
    into v_mockups_webhook
  from public.ghl_funnel_events e
  where (e.received_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
    and (e.received_at at time zone 'America/Sao_Paulo')::date >= date '2026-07-16'
    and e.contact_id not in (select contact_id from public.v_contatos_importados);

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
