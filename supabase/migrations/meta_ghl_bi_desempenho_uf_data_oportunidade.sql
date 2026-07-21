-- ============================================================
-- v_desempenho_uf_mes: agrupar pela data da OPORTUNIDADE, não do
-- contato (já aplicado no projeto Dashboard-v2 via MCP em 2026-07-21)
--
-- Mesmo bug já corrigido em v_leads_sem_venda e v_atribuicao_saude:
-- a view agrupava o lado GHL por ghl_contacts.created_at (dateAdded
-- do contato, com resquício de 04/2026), gerando uma coluna fantasma
-- "2026-04" com leads mas sem spend correspondente (Meta só tem
-- dados desde 07/2026) -> CPL = 0/leads = R$0,00, um zero enganoso
-- (parece lead grátis, na verdade é mês sem dado de investimento).
-- Também fazia aparecer um card fantasma de "outono" na sazonalidade.
-- ============================================================
create or replace view public.v_desempenho_uf_mes
with (security_invoker = true) as
with meta_uf as (
  select uf, date_trunc('month', date)::date as mes, sum(spend) as spend, sum(leads) as leads_meta
  from public.meta_insights_daily
  where uf is not null
  group by uf, date_trunc('month', date)
),
ghl_uf as (
  select
    c.uf,
    date_trunc('month', o.created_at at time zone 'America/Sao_Paulo')::date as mes,
    count(distinct c.id) as leads_ghl,
    count(distinct v.contact_id) as vendas,
    coalesce(sum(v.monetary_value), 0) as faturamento
  from public.ghl_opportunities o
  join public.ghl_contacts c on c.id = o.contact_id
  left join public.v_vendas v on v.contact_id = c.id
  where c.uf is not null
  group by c.uf, date_trunc('month', o.created_at at time zone 'America/Sao_Paulo')
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
