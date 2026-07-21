-- ============================================================
-- BI Meta Ads x GoHighLevel - Views de análise
-- Todas com security_invoker: a RLS das tabelas base vale para
-- quem consulta (authenticated lê, anon não vê nada).
-- Datas agregadas em America/Sao_Paulo.
-- Estações (hemisfério sul, simplificado por mês):
--   verão = dez-fev | outono = mar-mai | inverno = jun-ago | primavera = set-nov
-- ============================================================

-- Função auxiliar: mês -> estação do ano (hemisfério sul)
create or replace function public.estacao_do_mes(p_mes int)
returns text language sql immutable as $$
  select case
    when p_mes in (12, 1, 2) then 'verão'
    when p_mes in (3, 4, 5) then 'outono'
    when p_mes in (6, 7, 8) then 'inverno'
    else 'primavera'
  end;
$$;

-- ------------------------------------------------------------
-- v_funnel_por_anuncio: funil completo por anúncio
-- Lado Meta: spend/impressões/cliques/leads reportados pelo Meta.
-- Lado GHL: contatos cujo utm_content = ad_id, vendas = oportunidades
-- won desses contatos, faturamento = soma de monetary_value das won.
-- diagnostico: 'GERA VENDA' (roas >= 2), 'LEAD BARATO VENDA CARA'
-- (>=10 leads e conversão < 5%), senão 'REVISAR'.
-- ------------------------------------------------------------
create or replace view public.v_funnel_por_anuncio
with (security_invoker = true) as
with thresholds as (
  select 2.0::numeric as roas_bom,      -- roas mínimo para 'GERA VENDA'
         10::bigint  as min_leads,      -- mínimo de leads p/ diagnosticar conversão
         5.0::numeric as conv_minima    -- % mínima de conversão lead->venda
),
meta as (
  select
    ad_id,
    max(ad_name) as ad_name,
    max(campaign_name) as campaign_name,
    sum(spend) as spend_total,
    sum(impressions) as impressoes,
    sum(clicks) as cliques,
    sum(leads) as leads_meta
  from public.meta_insights_daily
  group by ad_id
),
ghl as (
  select
    c.ad_id,
    count(*) as leads_ghl,
    count(distinct o.contact_id) filter (where o.status = 'won') as vendas,
    coalesce(sum(o.monetary_value) filter (where o.status = 'won'), 0) as faturamento
  from public.ghl_contacts c
  left join public.ghl_opportunities o on o.contact_id = c.id
  where c.ad_id is not null and c.ad_id <> ''
  group by c.ad_id
)
select
  m.ad_id,
  m.ad_name,
  m.campaign_name,
  m.spend_total,
  m.impressoes,
  m.cliques,
  m.leads_meta,
  case when m.leads_meta > 0 then round(m.spend_total / m.leads_meta, 2) end as cpl_meta,
  coalesce(g.leads_ghl, 0) as leads_ghl,
  coalesce(g.vendas, 0) as vendas,
  coalesce(g.faturamento, 0) as faturamento,
  case when coalesce(g.leads_ghl, 0) > 0
       then round(100.0 * coalesce(g.vendas, 0) / g.leads_ghl, 2) end as taxa_conversao_lead_venda,
  case when coalesce(g.vendas, 0) > 0
       then round(m.spend_total / g.vendas, 2) end as cpa_venda,
  case when m.spend_total > 0
       then round(coalesce(g.faturamento, 0) / m.spend_total, 2) end as roas,
  case
    when m.spend_total > 0
         and coalesce(g.faturamento, 0) / m.spend_total >= (select roas_bom from thresholds)
      then 'GERA VENDA'
    when coalesce(g.leads_ghl, 0) >= (select min_leads from thresholds)
         and 100.0 * coalesce(g.vendas, 0) / g.leads_ghl < (select conv_minima from thresholds)
      then 'LEAD BARATO VENDA CARA'
    else 'REVISAR'
  end as diagnostico
from meta m
left join ghl g on g.ad_id = m.ad_id;

-- ------------------------------------------------------------
-- v_desempenho_uf_mes: desempenho por UF + mês
-- ATENÇÃO às duas óticas: o lado Meta usa a REGIÃO DO CLIQUE
-- (breakdown region da API); o lado GHL usa o ESTADO INFORMADO
-- pelo contato. São visões complementares, não idênticas.
-- ------------------------------------------------------------
create or replace view public.v_desempenho_uf_mes
with (security_invoker = true) as
with meta_uf as (
  select
    uf,
    date_trunc('month', date)::date as mes,
    sum(spend) as spend,
    sum(leads) as leads_meta
  from public.meta_insights_daily
  where uf is not null
  group by uf, date_trunc('month', date)
),
ghl_uf as (
  select
    c.uf,
    date_trunc('month', c.created_at at time zone 'America/Sao_Paulo')::date as mes,
    count(*) as leads_ghl,
    count(distinct o.contact_id) filter (where o.status = 'won') as vendas,
    coalesce(sum(o.monetary_value) filter (where o.status = 'won'), 0) as faturamento
  from public.ghl_contacts c
  left join public.ghl_opportunities o on o.contact_id = c.id
  where c.uf is not null
  group by c.uf, date_trunc('month', c.created_at at time zone 'America/Sao_Paulo')
)
select
  coalesce(m.uf, g.uf) as uf,
  d.region_group,
  coalesce(m.mes, g.mes) as mes,
  public.estacao_do_mes(extract(month from coalesce(m.mes, g.mes))::int) as estacao,
  coalesce(m.spend, 0) as spend,
  coalesce(m.leads_meta, 0) as leads_meta,
  coalesce(g.leads_ghl, 0) as leads_ghl,
  coalesce(g.vendas, 0) as vendas,
  coalesce(g.faturamento, 0) as faturamento
from meta_uf m
full outer join ghl_uf g on g.uf = m.uf and g.mes = m.mes
left join public.dim_region_group d on d.uf = coalesce(m.uf, g.uf);

-- ------------------------------------------------------------
-- v_sazonalidade_regiao: agregação por região IBGE + estação
-- Responde "vale anunciar no Sul no inverno?"
-- ------------------------------------------------------------
create or replace view public.v_sazonalidade_regiao
with (security_invoker = true) as
select
  region_group,
  estacao,
  sum(spend) as spend,
  sum(vendas) as vendas,
  sum(faturamento) as faturamento,
  case when sum(spend) > 0 then round(sum(faturamento) / sum(spend), 2) end as roas,
  case when sum(vendas) > 0 then round(sum(spend) / sum(vendas), 2) end as cpa
from public.v_desempenho_uf_mes
where region_group is not null
group by region_group, estacao;

-- ------------------------------------------------------------
-- v_leads_sem_venda: anúncios que geram lead frio
-- Contatos com ad_id, criados há mais de 14 dias, sem nenhuma
-- oportunidade won. Ordenado por spend desc.
-- ------------------------------------------------------------
create or replace view public.v_leads_sem_venda
with (security_invoker = true) as
with frios as (
  select c.ad_id, count(*) as qtd_leads_frios
  from public.ghl_contacts c
  where c.ad_id is not null and c.ad_id <> ''
    and c.created_at < now() - interval '14 days'
    and not exists (
      select 1 from public.ghl_opportunities o
      where o.contact_id = c.id and o.status = 'won'
    )
  group by c.ad_id
),
spend as (
  select ad_id, max(ad_name) as ad_name, max(campaign_name) as campaign_name,
         sum(spend) as spend_total
  from public.meta_insights_daily
  group by ad_id
)
select
  f.ad_id,
  s.ad_name,
  s.campaign_name,
  f.qtd_leads_frios,
  coalesce(s.spend_total, 0) as spend,
  case when f.qtd_leads_frios > 0
       then round(coalesce(s.spend_total, 0) / f.qtd_leads_frios, 2) end as custo_por_lead_frio
from frios f
left join spend s on s.ad_id = f.ad_id
order by coalesce(s.spend_total, 0) desc;

-- ------------------------------------------------------------
-- v_atribuicao_saude: monitor da qualidade da atribuição
-- % de contatos com utm_content por semana + % de match com ad_id
-- conhecido no Meta. Se cair, a atribuição quebrou (UTMs erradas
-- nos anúncios ou GHL parou de gravar).
-- ------------------------------------------------------------
create or replace view public.v_atribuicao_saude
with (security_invoker = true) as
select
  date_trunc('week', c.created_at at time zone 'America/Sao_Paulo')::date as semana,
  count(*) as contatos,
  count(*) filter (where c.utm_content is not null and c.utm_content <> '') as com_utm,
  round(100.0 * count(*) filter (where c.utm_content is not null and c.utm_content <> '')
        / nullif(count(*), 0), 1) as pct_com_utm,
  count(*) filter (
    where exists (select 1 from public.meta_insights_daily m where m.ad_id = c.utm_content)
  ) as com_match_meta,
  round(100.0 * count(*) filter (
          where exists (select 1 from public.meta_insights_daily m where m.ad_id = c.utm_content))
        / nullif(count(*) filter (where c.utm_content is not null and c.utm_content <> ''), 0),
        1) as pct_match_meta
from public.ghl_contacts c
where c.created_at is not null
group by 1
order by 1 desc;

-- ------------------------------------------------------------
-- get_resumo_periodo: KPIs gerais do período em uma chamada
-- (security invoker: respeita a RLS do usuário autenticado)
-- ------------------------------------------------------------
create or replace function public.get_resumo_periodo(p_inicio date, p_fim date)
returns jsonb
language plpgsql
stable
security invoker
as $$
declare
  v_spend numeric;
  v_leads_meta bigint;
  v_leads_ghl bigint;
  v_vendas bigint;
  v_faturamento numeric;
begin
  select coalesce(sum(spend), 0), coalesce(sum(leads), 0)
    into v_spend, v_leads_meta
  from public.meta_insights_daily
  where date between p_inicio and p_fim;

  select count(*) into v_leads_ghl
  from public.ghl_contacts
  where (created_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim;

  select count(distinct o.contact_id), coalesce(sum(o.monetary_value), 0)
    into v_vendas, v_faturamento
  from public.ghl_opportunities o
  where o.status = 'won'
    and (coalesce(o.won_at, o.updated_at) at time zone 'America/Sao_Paulo')::date
        between p_inicio and p_fim;

  return jsonb_build_object(
    'spend', v_spend,
    'leads_meta', v_leads_meta,
    'leads_ghl', v_leads_ghl,
    'vendas', v_vendas,
    'faturamento', v_faturamento,
    'roas', case when v_spend > 0 then round(v_faturamento / v_spend, 2) end,
    'cpa', case when v_vendas > 0 then round(v_spend / v_vendas, 2) end,
    'cpl', case when v_leads_ghl > 0 then round(v_spend / v_leads_ghl, 2) end
  );
end;
$$;

comment on function public.get_resumo_periodo(date, date) is
  'KPIs gerais do período (spend, leads, vendas, faturamento, roas, cpa, cpl) em JSON.';
