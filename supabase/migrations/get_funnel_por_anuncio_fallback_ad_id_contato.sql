-- ============================================================
-- Criado em 2026-08-17
--
-- Achado ao investigar por que "Solicitações de Mockup" da Visão
-- Geral (115, 10-16/08) não batia com a soma da coluna Mockups da aba
-- Anúncios (78) -- usuário suspeitou que fosse o pipeline "Fábrica de
-- Mockups" (mesma classe do bug de dim_pipeline_stages corrigido
-- antes), mas a causa real era outra: dos 37 que "sobravam", 25 não
-- tinham "Utm Content" no evento -- 15 eram genuinamente sem
-- atribuição (link_in_bio ou nenhuma origem), mas 10 pertenciam a
-- contatos com ad_id REAL e válido no cadastro (ex.: JornalNegocioV2.7).
--
-- Causa raiz: todos os 10 eram eventos "backfill_reconstructed"
-- (gerados em 12/08 pelo script que recuperou webhooks perdidos do
-- bug de timestamp ausente) -- o script reconstruiu o evento mas não
-- preencheu "Utm Content" no raw_payload, mesmo o contato já tendo o
-- ad_id salvo (ghl_contacts.ad_id, coluna gerada de utm_content
-- capturado no primeiro contato -- fonte "viva"/confiável).
--
-- Mesmo princípio já usado pra valor/pares em versões anteriores
-- desse arquivo: "isso aconteceu, e quando" vem do webhook (payload
-- congelado, pode estar incompleto), "qual é o dado certo" vem do
-- registro vivo do contato quando o payload não tem. Fix: quando
-- raw_payload->>'Utm Content' vier vazio, cair pro ad_id já salvo em
-- ghl_contacts -- só afeta get_funnel_por_anuncio (get_funil_etapas/
-- _kpis_periodo não filtram por ad_id, não são afetados por esse gap).
-- ============================================================

create or replace function public.get_funnel_por_anuncio(p_inicio date, p_fim date)
 returns table(ad_id text, ad_name text, campaign_id text, campaign_name text, adset_id text, adset_name text, spend_total numeric, impressoes bigint, cliques bigint, leads_meta numeric, cpl_meta numeric, leads_ghl bigint, orcamentos bigint, valor_orcamentos numeric, pares_orcamentos bigint, mockups bigint, negociacoes bigint, vendas bigint, faturamento numeric, pares_vendidos bigint, custo_por_lead numeric, custo_por_orcamento numeric, custo_por_mockup numeric, custo_por_negociacao numeric, cpa_venda numeric, taxa_conversao_lead_venda numeric, roas numeric, diagnostico text)
 language sql
 stable
as $function$
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
      case when public.dado_par_plausivel(coalesce(o.qty_pares, c.qty_pares), o.monetary_value)
           then o.monetary_value end as monetary_value,
      case when public.dado_par_plausivel(coalesce(o.qty_pares, c.qty_pares), o.monetary_value)
           then coalesce(o.qty_pares, c.qty_pares) end as qty_pares,
      greatest(coalesce(a.max_order, 0), coalesce(dcur.stage_order, 0)) as max_order
    from public.ghl_opportunities o
    join public.ghl_contacts c on c.id = o.contact_id
    left join alcance a on a.opportunity_id = o.id
    left join public.dim_pipeline_stages dcur on dcur.stage_id = o.stage_id
    where c.ad_id ~ '^[0-9]{10,}$'
      and (o.created_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
      and o.contact_id not in (select contact_id from public.v_contatos_importados)
  ),
  pipeline_agg as (
    select
      opp.ad_id,
      count(distinct opp.contact_id) as leads_total,
      count(*) filter (where opp.status = 'won' and opp.monetary_value > 0) as vendas,
      coalesce(sum(opp.monetary_value) filter (where opp.status = 'won'), 0) as faturamento,
      sum(opp.qty_pares) filter (where opp.status = 'won') as pares_vendidos,
      count(*) filter (where opp.created_at < now() - interval '35 days') as leads_maduros,
      count(*) filter (where opp.created_at < now() - interval '35 days' and opp.status = 'won' and opp.monetary_value > 0) as vendas_maduras
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
      -- Fallback pro ad_id vivo do contato quando o evento (em
      -- especial os "backfill_reconstructed" de 12/08) não trouxe
      -- "Utm Content" -- ver comentário no topo do arquivo.
      coalesce(nullif(e.raw_payload->>'Utm Content', ''), c.ad_id) as ad_id,
      case when public.dado_par_plausivel(
             e.quantidade_pares,
             coalesce(nullif(e.raw_payload->>'Orçamento Total com Frete', '')::numeric,
                      nullif(e.raw_payload->>'Orçamento Subtotal', '')::numeric)
           )
           then e.quantidade_pares end as quantidade_pares,
      case when public.dado_par_plausivel(
             e.quantidade_pares,
             coalesce(nullif(e.raw_payload->>'Orçamento Total com Frete', '')::numeric,
                      nullif(e.raw_payload->>'Orçamento Subtotal', '')::numeric)
           )
           then coalesce(
                  nullif(e.raw_payload->>'Orçamento Total com Frete', '')::numeric,
                  nullif(e.raw_payload->>'Orçamento Subtotal', '')::numeric
                )
      end as valor_congelado
    from public.ghl_funnel_events e
    left join public.ghl_contacts c on c.id = e.contact_id
    where (e.received_at at time zone 'America/Sao_Paulo')::date >= date '2026-07-16'
      and (e.received_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
      and e.contact_id not in (select contact_id from public.v_contatos_importados)
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
      case when public.dado_par_plausivel(o.qty_pares, o.monetary_value) then o.monetary_value end as monetary_value_opp,
      case when public.dado_par_plausivel(o.qty_pares, o.monetary_value) then o.qty_pares end as qty_pares_opp,
      exists (
        select 1 from opp o2
        where o2.contact_id = w.contact_id and o2.ad_id = w.ad_id
      ) as ja_no_pipeline_deste_anuncio
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
      count(*) filter (where reached_negociacao) as negociacoes_webhook,
      count(*) filter (where not ja_no_pipeline_deste_anuncio) as leads_orfaos_webhook
    from webhook_com_opp
    where ad_id ~ '^[0-9]{10,}$'
    group by ad_id
  ),
  meta as (
    select ad_id,
           max(ad_name) as ad_name,
           max(campaign_id) as campaign_id,
           max(campaign_name) as campaign_name,
           max(adset_id) as adset_id,
           max(adset_name) as adset_name,
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
      coalesce(p.leads_total, 0) + coalesce(w.leads_orfaos_webhook, 0) as leads_ghl,
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
    m.campaign_id,
    m.campaign_name,
    m.adset_id,
    m.adset_name,
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
