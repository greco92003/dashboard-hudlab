-- ============================================================
-- Ajuste 2026-07-23 (parte 6, aplicado no Dashboard-v2 via MCP)
--
-- valor_orcamentos/pares_orcamentos (braço webhook, pós-16/07, em
-- get_funnel_por_anuncio) passam a preferir o dado VIVO da oportunidade
-- (ghl_opportunities.monetary_value/qty_pares) em vez do payload congelado
-- do webhook -- só caem pro payload quando a oportunidade ainda não foi
-- sincronizada (contact_id sem match em ghl_opportunities).
--
-- Motivo: um cliente digitou errado no formulário de orçamento (2530
-- pares / R$126.247 em vez do valor real, ~R$1.497/poucas dezenas de
-- pares) -- a equipe corrigiu a oportunidade no GHL, mas o dashboard
-- continuava mostrando o valor errado, porque ghl_funnel_events é um
-- recibo único, nunca ressincronizado (correção não tinha como refletir).
--
-- Princípio geral: "isso aconteceu, e quando" deve vir do webhook
-- (timestamp fixo, correto por natureza -- não muda depois). "Qual é o
-- valor certo" é uma pergunta cuja resposta MUDA com o tempo (correções
-- no GHL) -- por isso deve vir sempre do dado vivo, que já se autocorrige
-- a cada sync diário. Efeito colateral positivo: antes valor_orcamentos só
-- somava contatos que TAMBÉM chegaram no evento de mockup (único lugar
-- onde o payload trazia o valor) -- agora soma qualquer contato que
-- alcançou orçamento, contanto que a oportunidade tenha monetary_value.
--
-- Resultado observado (JudoNoticia, 7 dias): valor_orcamentos R$129.576,80
-- -> R$5.642,10 (corrigido automaticamente). pares_orcamentos continuou em
-- 2582, porque o campo qty_pares da oportunidade em si nunca foi corrigido
-- no GHL (só o monetary_value foi) -- confirma que o mecanismo funciona;
-- falta só a equipe completar a correção na origem.
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
      count(distinct opp.contact_id) as leads_total,
      count(*) filter (where opp.status = 'won') as vendas,
      coalesce(sum(opp.monetary_value) filter (where opp.status = 'won'), 0) as faturamento,
      sum(opp.qty_pares) filter (where opp.status = 'won') as pares_vendidos,
      count(*) filter (where opp.created_at < now() - interval '35 days') as leads_maduros,
      count(*) filter (where opp.created_at < now() - interval '35 days' and opp.status = 'won') as vendas_maduras
    from opp
    group by opp.ad_id
  ),
  legado_agg as (
    select
      opp.ad_id,
      count(*) filter (where opp.max_order >= m.ord_orcamento) as orcamentos_legado,
      coalesce(sum(opp.monetary_value) filter (where opp.max_order >= m.ord_orcamento), 0) as valor_orcamentos_legado,
      sum(opp.qty_pares) filter (where opp.max_order >= m.ord_orcamento) as pares_orcamentos_legado,
      count(*) filter (where opp.max_order >= m.ord_mockup) as mockups_legado,
      count(*) filter (where opp.max_order >= m.ord_negociacao) as negociacoes_legado
    from opp, marcos m
    where (opp.created_at at time zone 'America/Sao_Paulo')::date < date '2026-07-16'
    group by opp.ad_id
  ),
  webhook_eventos as (
    select
      e.contact_id,
      e.stage_slug,
      nullif(e.raw_payload->>'Utm Content', '') as ad_id,
      e.quantidade_pares,
      coalesce(
        nullif(e.raw_payload->>'Orçamento Total com Frete', '')::numeric,
        nullif(e.raw_payload->>'Orçamento Subtotal', '')::numeric
      ) as valor_congelado
    from public.ghl_funnel_events e
    where (e.received_at at time zone 'America/Sao_Paulo')::date >= date '2026-07-16'
      and (e.received_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
  ),
  webhook_por_contato as (
    select
      contact_id,
      max(ad_id) filter (where ad_id is not null) as ad_id,
      bool_or(stage_slug = 'solicitouorcamento') as reached_orcamento,
      bool_or(stage_slug = 'solicitoumockupoficial') as reached_mockup,
      bool_or(stage_slug = 'emnegociacao') as reached_negociacao,
      max(quantidade_pares) filter (where stage_slug = 'solicitoumockupoficial') as pares_congelado,
      max(valor_congelado) filter (where stage_slug = 'solicitoumockupoficial') as valor_congelado
    from webhook_eventos
    group by contact_id
  ),
  webhook_com_opp as (
    select
      w.*,
      o.monetary_value as monetary_value_opp,
      o.qty_pares as qty_pares_opp
    from webhook_por_contato w
    left join public.ghl_opportunities o on o.contact_id = w.contact_id
  ),
  webhook_agg as (
    select
      ad_id,
      count(*) filter (where reached_orcamento) as orcamentos_webhook,
      coalesce(sum(coalesce(monetary_value_opp, valor_congelado)) filter (where reached_orcamento), 0) as valor_orcamentos_webhook,
      sum(coalesce(qty_pares_opp, pares_congelado)) filter (where reached_orcamento) as pares_orcamentos_webhook,
      count(*) filter (where reached_mockup) as mockups_webhook,
      count(*) filter (where reached_negociacao) as negociacoes_webhook
    from webhook_com_opp
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
      coalesce(p.leads_total, 0) as leads_ghl,
      coalesce(l.orcamentos_legado, 0) + coalesce(w.orcamentos_webhook, 0) as orcamentos,
      coalesce(l.valor_orcamentos_legado, 0) + coalesce(w.valor_orcamentos_webhook, 0) as valor_orcamentos,
      coalesce(l.pares_orcamentos_legado, 0) + coalesce(w.pares_orcamentos_webhook, 0) as pares_orcamentos,
      coalesce(l.mockups_legado, 0) + coalesce(w.mockups_webhook, 0) as mockups,
      coalesce(l.negociacoes_legado, 0) + coalesce(w.negociacoes_webhook, 0) as negociacoes,
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
