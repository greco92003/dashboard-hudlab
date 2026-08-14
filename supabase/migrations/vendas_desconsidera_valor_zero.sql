-- ============================================================
-- Criado em 2026-08-13
--
-- Achado pelo usuário ao investigar por que "Vendas (pedidos)" (13,
-- últimos 7 dias) não batia com "Pagamento Confirmado" no Custo por
-- etapa do funil (7) -- na investigação apareceram 6 dos 13 negócios
-- "ganhos" com monetary_value = 0,00 (amostras lançadas manualmente
-- pra representantes em 12/08, poucos pares cada). Decisão do usuário:
-- negócio sem valor não é "venda" de verdade -- não deve contar no
-- NÚMERO de vendas nem no CAC/pedido -- mas os PARES continuam
-- contando normalmente (dilui corretamente o ticket médio/par, já que
-- pares saídos de graça reduzem a receita média por par -- efeito
-- real que já acontecia sozinho via ticket_medio_par = faturamento /
-- pares, sem precisar de mudança nenhuma ali).
--
-- v_vendas (a view base) NÃO muda -- continua listando todo negócio
-- status='won', com monetary_value podendo ser 0. O filtro
-- "monetary_value > 0" é aplicado em CADA consumidor que CONTA vendas
-- (nunca nos que SOMAM pares/faturamento, que já tratam $0
-- corretamente por si só). Varredura completa de quem lê v_vendas
-- (mesma receita de outras vezes: `select viewname from pg_views
-- where definition ilike '%v_vendas%'` + prosrc equivalente pra
-- funções) achou 5 consumidores de v_vendas + 1 fora dela
-- (get_funnel_por_anuncio, que conta "vendas" direto de
-- ghl_opportunities.status='won', não via v_vendas).
-- ============================================================

-- 1) _kpis_periodo: "Vendas (pedidos)" da Visão Geral
create or replace function public._kpis_periodo(p_inicio date, p_fim date)
 returns jsonb
 language plpgsql
 stable
as $function$
declare
  v_spend numeric;
  v_impressoes bigint;
  v_cliques bigint;
  v_leads bigint;
  v_vendas bigint;
  v_faturamento numeric;
  v_faturamento_com_pares numeric;
  v_vendas_sem_pares bigint;
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

  -- "venda" agora exige monetary_value > 0 (negócio ganho com valor
  -- zero, ex.: amostra grátis pra representante, não é venda de
  -- verdade) -- pares/faturamento continuam somando tudo, o $0 já não
  -- contribuía pra soma mesmo antes.
  select
    count(distinct v.contact_id) filter (where v.monetary_value > 0),
    coalesce(sum(v.monetary_value), 0),
    sum(v.qty_pares),
    coalesce(sum(v.monetary_value) filter (where v.qty_pares is not null), 0),
    count(*) filter (where v.qty_pares is null and v.monetary_value > 0)
    into v_vendas, v_faturamento, v_pares, v_faturamento_com_pares, v_vendas_sem_pares
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
    'ticket_medio_par', case when v_pares > 0 then round(v_faturamento_com_pares / v_pares, 2) end,
    'custo_por_par', case when v_pares > 0 then round(v_spend / v_pares, 2) end,
    'vendas_sem_pares', v_vendas_sem_pares,
    'mockups', v_mockups,
    'custo_por_mockup', case when v_mockups > 0 then round(v_spend / v_mockups, 2) end
  );
end;
$function$;

-- 2) get_funnel_por_anuncio: "vendas"/"vendas_maduras" (aba Anúncios,
-- diagnóstico GERA VENDA/LEAD BARATO VENDA CARA, e por extensão
-- Insights + Criativos que leem essa função). Não usa v_vendas -- conta
-- direto de ghl_opportunities.status='won' com o mesmo
-- monetary_value já sanitizado por dado_par_plausivel na própria CTE
-- opp, então o filtro > 0 aqui trata NULL (implausível) e 0 (amostra
-- grátis) da mesma forma -- ambos corretamente não são "venda".
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
      nullif(e.raw_payload->>'Utm Content', '') as ad_id,
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

-- 3) v_desempenho_fonte: "vendas" por fonte (Visão Geral)
create or replace view public.v_desempenho_fonte as
with contatos as (
  select c.id,
    case
      when c.ad_id ~ '^[0-9]{10,}$' then 'Meta Ads'
      when (c.ad_id = 'link_in_bio' or lower(coalesce(nullif(c.utm_source, ''), nullif(c.source, ''), '')) ~ '(facebook|instagram|meta|^fb$)') then 'Instagram/Facebook (perfil)'
      when lower(coalesce(nullif(c.utm_source, ''), nullif(c.source, ''), '')) ~ 'google' then 'Google Ads'
      when lower(coalesce(nullif(c.utm_source, ''), nullif(c.source, ''), '')) ~ '(indica|referral)' then 'Indicação'
      when nullif(lower(nullif(c.utm_source, '')), 'website') is null then 'Orgânico'
      else 'Outros'
    end as fonte
  from public.ghl_contacts c
  where c.id not in (select contact_id from public.v_contatos_importados)
),
leads_agg as (
  select contatos.fonte, count(*) as leads
  from contatos
  group by contatos.fonte
),
vendas_agg as (
  select coalesce(ct.fonte, 'Outros') as fonte,
    count(distinct v.contact_id) filter (where v.monetary_value > 0) as vendas,
    coalesce(sum(v.monetary_value), 0) as faturamento
  from public.v_vendas v
  left join contatos ct on ct.id = v.contact_id
  group by coalesce(ct.fonte, 'Outros')
),
agg as (
  select coalesce(l.fonte, v.fonte) as fonte,
    coalesce(l.leads, 0) as leads,
    coalesce(v.vendas, 0) as vendas,
    coalesce(v.faturamento, 0) as faturamento
  from leads_agg l
  full join vendas_agg v on v.fonte = l.fonte
),
spend_por_fonte as (
  select 'Meta Ads' as fonte, sum(meta_insights_daily.spend) as investimento
  from public.meta_insights_daily
)
select a.fonte,
  s.investimento,
  a.leads,
  case when s.investimento is not null and a.leads > 0 then round(s.investimento / a.leads, 2) else null end as cpl,
  a.vendas,
  a.faturamento,
  case when s.investimento is not null and s.investimento > 0 then round(a.faturamento / s.investimento, 2) else null end as roas
from agg a
left join spend_por_fonte s on s.fonte = a.fonte
order by a.faturamento desc;

-- 4) v_desempenho_uf_mes: "vendas" por UF/mês (aba Regiões)
create or replace view public.v_desempenho_uf_mes as
with marcos as (
  select (select stage_order from public.dim_pipeline_stages where stage_name = 'Amostra Digital Enviada') as ord_mockup
),
alcance as (
  select s.opportunity_id, max(coalesce(d.stage_order, 0)) as max_order
  from public.ghl_stage_snapshots s
  left join public.dim_pipeline_stages d on d.stage_id = s.stage_id
  group by s.opportunity_id
),
meta_uf as (
  select meta_insights_daily.uf,
    date_trunc('month', meta_insights_daily.date::timestamp without time zone)::date as mes,
    sum(meta_insights_daily.spend) as spend,
    sum(meta_insights_daily.leads) as leads_meta
  from public.meta_insights_daily
  where meta_insights_daily.uf is not null
  group by meta_insights_daily.uf, date_trunc('month', meta_insights_daily.date::timestamp without time zone)
),
opp as (
  select o.id, o.contact_id, c.uf,
    date_trunc('month', o.created_at at time zone 'America/Sao_Paulo')::date as mes,
    greatest(coalesce(a.max_order, 0), coalesce(dcur.stage_order, 0)) as max_order,
    o.created_at
  from public.ghl_opportunities o
  join public.ghl_contacts c on c.id = o.contact_id
  left join alcance a on a.opportunity_id = o.id
  left join public.dim_pipeline_stages dcur on dcur.stage_id = o.stage_id
  where c.uf is not null and o.contact_id not in (select contact_id from public.v_contatos_importados)
),
legado_uf as (
  select opp.uf, opp.mes,
    count(distinct opp.contact_id) as leads_ghl,
    count(*) filter (where opp.max_order >= m.ord_mockup) as mockups_legado
  from opp, marcos m
  where (opp.created_at at time zone 'America/Sao_Paulo')::date < date '2026-07-16'
  group by opp.uf, opp.mes
),
webhook_uf as (
  select upper(nullif(e.raw_payload->>'Estado', ''))::character(2) as uf,
    date_trunc('month', e.received_at at time zone 'America/Sao_Paulo')::date as mes,
    count(*) as mockups_webhook
  from public.ghl_funnel_events e
  where e.stage_slug = 'solicitoumockupoficial'
    and (e.received_at at time zone 'America/Sao_Paulo')::date >= date '2026-07-16'
    and length(upper(nullif(e.raw_payload->>'Estado', ''))) = 2
  group by upper(nullif(e.raw_payload->>'Estado', ''))::character(2), date_trunc('month', e.received_at at time zone 'America/Sao_Paulo')::date
),
ghl_uf as (
  select coalesce(lu.uf, wu.uf) as uf,
    coalesce(lu.mes, wu.mes) as mes,
    coalesce(lu.leads_ghl, 0) as leads_ghl,
    coalesce(lu.mockups_legado, 0) + coalesce(wu.mockups_webhook, 0) as mockups
  from legado_uf lu
  full join webhook_uf wu on wu.uf = lu.uf and wu.mes = lu.mes
),
vendas_uf as (
  select c.uf,
    date_trunc('month', o.created_at at time zone 'America/Sao_Paulo')::date as mes,
    count(distinct v.contact_id) filter (where v.monetary_value > 0) as vendas,
    coalesce(sum(v.monetary_value), 0) as faturamento
  from public.ghl_opportunities o
  join public.ghl_contacts c on c.id = o.contact_id
  left join public.v_vendas v on v.contact_id = c.id
  where c.uf is not null and o.contact_id not in (select contact_id from public.v_contatos_importados)
  group by c.uf, date_trunc('month', o.created_at at time zone 'America/Sao_Paulo')::date
)
select coalesce(m.uf, g.uf, ve.uf) as uf,
  d.region_group,
  coalesce(m.mes, g.mes, ve.mes) as mes,
  public.estacao_do_mes(extract(month from coalesce(m.mes, g.mes, ve.mes))::integer) as estacao,
  coalesce(m.spend, 0) as spend,
  coalesce(m.leads_meta, 0) as leads_meta,
  coalesce(g.leads_ghl, 0) as leads_ghl,
  coalesce(g.mockups, 0) as mockups,
  coalesce(ve.vendas, 0) as vendas,
  coalesce(ve.faturamento, 0) as faturamento
from meta_uf m
full join ghl_uf g on g.uf = m.uf and g.mes = m.mes
full join vendas_uf ve on ve.uf = coalesce(m.uf, g.uf) and ve.mes = coalesce(m.mes, g.mes)
left join public.dim_region_group d on d.uf = coalesce(m.uf, g.uf, ve.uf);

-- 5) v_leads_sem_venda: lead frio só conta como "sem venda" se não tem
-- NENHUMA venda de verdade (amostra grátis não conta como conversão)
create or replace view public.v_leads_sem_venda as
with frios as (
  select c.ad_id, count(distinct o.id) as qtd_leads_frios
  from public.ghl_opportunities o
  join public.ghl_contacts c on c.id = o.contact_id
  where c.ad_id is not null and c.ad_id <> ''
    and o.created_at < now() - interval '35 days'
    and not exists (
      select 1 from public.v_vendas v where v.contact_id = c.id and v.monetary_value > 0
    )
  group by c.ad_id
),
spend as (
  select meta_insights_daily.ad_id,
    max(meta_insights_daily.ad_name) as ad_name,
    max(meta_insights_daily.campaign_name) as campaign_name,
    sum(meta_insights_daily.spend) as spend_total
  from public.meta_insights_daily
  group by meta_insights_daily.ad_id
)
select f.ad_id, s.ad_name, s.campaign_name, f.qtd_leads_frios,
  coalesce(s.spend_total, 0) as spend,
  case when f.qtd_leads_frios > 0 then round(coalesce(s.spend_total, 0) / f.qtd_leads_frios, 2) else null end as custo_por_lead_frio
from frios f
left join spend s on s.ad_id = f.ad_id
order by coalesce(s.spend_total, 0) desc;

-- 6) v_vendas_sem_pares: só lista vendas de verdade (valor > 0) sem
-- pares preenchidos -- amostra grátis sem pares não é "venda com dado
-- faltando pra corrigir", é uma amostra sem pares (caso diferente).
create or replace view public.v_vendas_sem_pares as
select v.id as opportunity_id, v.contact_id, c.first_name, c.last_name, c.email, c.phone,
  v.monetary_value, v.venda_em
from public.v_vendas v
left join public.ghl_contacts c on c.id = v.contact_id
where v.qty_pares is null and v.monetary_value > 0
order by v.venda_em desc;
