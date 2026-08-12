-- ============================================================
-- Criado em 2026-08-12
--
-- Continuação da auditoria de "números desproporcionais" (2026-08-10):
-- varredura em TODAS as views/funções que leem ghl_contacts/ghl_opportunities
-- pra achar consumidoras que ainda não excluíam v_contatos_importados
-- (mesmo padrão de bug que já apareceu em v_atribuicao_saude e v_vendas).
--
-- Achados e corrigidos:
-- 1. v_utm_sem_match: 551 de 555 linhas (99,3%) eram contatos do lote
--    de importação de 03/08/2026 (utm_content parecido com ad_id do Meta,
--    mas na verdade é ID de campanha do ActiveCampaign migrado). Sobraram
--    só 4 UTMs realmente quebradas, com datas reais espalhadas.
-- 2. v_desempenho_fonte: leads_agg contava TODO ghl_contacts sem excluir
--    importados -- "Meta Ads" 567/1047 (54%) eram importados, "Orgânico"
--    187/233 (80%), "Instagram/Facebook (perfil)" 172/227 (76%).
-- 3. v_desempenho_uf_mes: join ghl_opportunities+ghl_contacts sem excluir
--    importados -- 321 de 595 linhas (54%) eram importados, inflando
--    leads_ghl/mockups por UF.
-- ============================================================

create or replace view public.v_utm_sem_match
with (security_invoker = true) as
select
  utm_content,
  max(utm_campaign) as utm_campaign,
  max(utm_source) as utm_source,
  count(*) as qtd_contatos,
  max(created_at) as ultimo_contato
from ghl_contacts c
where utm_content ~ '^[0-9]{10,}$'
  and not exists (select 1 from meta_insights_daily m where m.ad_id = c.utm_content)
  and c.id not in (select contact_id from public.v_contatos_importados)
group by utm_content
order by count(*) desc;

create or replace view public.v_desempenho_fonte
with (security_invoker = true) as
with contatos as (
  select c.id,
    case
      when c.ad_id ~ '^[0-9]{10,}$' then 'Meta Ads'
      when c.ad_id = 'link_in_bio' or lower(coalesce(nullif(c.utm_source,''), nullif(c.source,''),'')) ~ '(facebook|instagram|meta|^fb$)' then 'Instagram/Facebook (perfil)'
      when lower(coalesce(nullif(c.utm_source,''), nullif(c.source,''),'')) ~ 'google' then 'Google Ads'
      when lower(coalesce(nullif(c.utm_source,''), nullif(c.source,''),'')) ~ '(indica|referral)' then 'Indicação'
      when nullif(lower(nullif(c.utm_source,'')), 'website') is null then 'Orgânico'
      else 'Outros'
    end as fonte
  from ghl_contacts c
  where c.id not in (select contact_id from public.v_contatos_importados)
),
leads_agg as (
  select contatos.fonte, count(*) as leads
  from contatos
  group by contatos.fonte
),
vendas_agg as (
  select coalesce(ct.fonte, 'Outros') as fonte,
    count(distinct v.contact_id) as vendas,
    coalesce(sum(v.monetary_value), 0) as faturamento
  from v_vendas v
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
  from meta_insights_daily
)
select a.fonte,
  s.investimento,
  a.leads,
  case when s.investimento is not null and a.leads > 0 then round(s.investimento / a.leads::numeric, 2) else null end as cpl,
  a.vendas,
  a.faturamento,
  case when s.investimento is not null and s.investimento > 0 then round(a.faturamento / s.investimento, 2) else null end as roas
from agg a
left join spend_por_fonte s on s.fonte = a.fonte
order by a.faturamento desc;

create or replace view public.v_desempenho_uf_mes
with (security_invoker = true) as
with marcos as (
  select (select stage_order from dim_pipeline_stages where stage_name = 'Amostra Digital Enviada') as ord_mockup
),
alcance as (
  select s.opportunity_id, max(coalesce(d.stage_order, 0)) as max_order
  from ghl_stage_snapshots s
  left join dim_pipeline_stages d on d.stage_id = s.stage_id
  group by s.opportunity_id
),
meta_uf as (
  select meta_insights_daily.uf,
    date_trunc('month', meta_insights_daily.date::timestamp)::date as mes,
    sum(meta_insights_daily.spend) as spend,
    sum(meta_insights_daily.leads) as leads_meta
  from meta_insights_daily
  where meta_insights_daily.uf is not null
  group by meta_insights_daily.uf, date_trunc('month', meta_insights_daily.date::timestamp)
),
opp as (
  select o.id, o.contact_id, c.uf,
    date_trunc('month', (o.created_at at time zone 'America/Sao_Paulo'))::date as mes,
    greatest(coalesce(a.max_order, 0), coalesce(dcur.stage_order, 0)) as max_order,
    o.created_at
  from ghl_opportunities o
  join ghl_contacts c on c.id = o.contact_id
  left join alcance a on a.opportunity_id = o.id
  left join dim_pipeline_stages dcur on dcur.stage_id = o.stage_id
  where c.uf is not null
    and o.contact_id not in (select contact_id from public.v_contatos_importados)
),
legado_uf as (
  select opp.uf, opp.mes,
    count(distinct opp.contact_id) as leads_ghl,
    count(*) filter (where opp.max_order >= m.ord_mockup) as mockups_legado
  from opp, marcos m
  where (opp.created_at at time zone 'America/Sao_Paulo')::date < '2026-07-16'
  group by opp.uf, opp.mes
),
webhook_uf as (
  select upper(nullif(e.raw_payload ->> 'Estado', ''))::char(2) as uf,
    date_trunc('month', (e.received_at at time zone 'America/Sao_Paulo'))::date as mes,
    count(*) as mockups_webhook
  from ghl_funnel_events e
  where e.stage_slug = 'solicitoumockupoficial'
    and (e.received_at at time zone 'America/Sao_Paulo')::date >= '2026-07-16'
    and length(upper(nullif(e.raw_payload ->> 'Estado', ''))) = 2
  group by upper(nullif(e.raw_payload ->> 'Estado', ''))::char(2), date_trunc('month', (e.received_at at time zone 'America/Sao_Paulo'))::date
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
    date_trunc('month', (o.created_at at time zone 'America/Sao_Paulo'))::date as mes,
    count(distinct v.contact_id) as vendas,
    coalesce(sum(v.monetary_value), 0) as faturamento
  from ghl_opportunities o
  join ghl_contacts c on c.id = o.contact_id
  left join v_vendas v on v.contact_id = c.id
  where c.uf is not null
    and o.contact_id not in (select contact_id from public.v_contatos_importados)
  group by c.uf, date_trunc('month', (o.created_at at time zone 'America/Sao_Paulo'))::date
)
select coalesce(m.uf, g.uf, ve.uf) as uf,
  d.region_group,
  coalesce(m.mes, g.mes, ve.mes) as mes,
  estacao_do_mes(extract(month from coalesce(m.mes, g.mes, ve.mes))::int) as estacao,
  coalesce(m.spend, 0) as spend,
  coalesce(m.leads_meta, 0) as leads_meta,
  coalesce(g.leads_ghl, 0) as leads_ghl,
  coalesce(g.mockups, 0) as mockups,
  coalesce(ve.vendas, 0) as vendas,
  coalesce(ve.faturamento, 0) as faturamento
from meta_uf m
full join ghl_uf g on g.uf = m.uf and g.mes = m.mes
full join vendas_uf ve on ve.uf = coalesce(m.uf, g.uf) and ve.mes = coalesce(m.mes, g.mes)
left join dim_region_group d on d.uf = coalesce(m.uf, g.uf, ve.uf);
