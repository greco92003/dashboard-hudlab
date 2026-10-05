-- Desempenho por estado e mês com período, para o mapa e a tabela da aba
-- Regiões. Mesma regra de v_desempenho_uf_mes (conferido linha a linha: zero
-- diferença no histórico inteiro), com duas mudanças de desempenho:
--  * o período filtra cada fonte pelo dia (índices de data no fuso de SP), e
--    sem período (nulos) devolve o histórico inteiro;
--  * NOT EXISTS direto em mv_contatos_importados no lugar de NOT IN na view, e
--    a maior etapa alcançada só é calculada para as oportunidades anteriores a
--    16/07/2026 (antes do webhook), em vez de agregar todos os snapshots.
-- Só service_role executa: a tela lê pela rota /api/meta-marketing/report.
create or replace function public.get_desempenho_uf(p_inicio date default null, p_fim date default null)
returns table(uf character(2), region_group text, mes date, estacao text, spend numeric, leads_meta numeric,
  leads_ghl bigint, mockups bigint, vendas bigint, faturamento numeric)
language sql stable security definer set search_path = ''
as $$
with lim as (
  select coalesce(p_inicio, date '2000-01-01') as ini, coalesce(p_fim, date '2999-12-31') as fim,
    (select stage_order from public.dim_pipeline_stages where stage_name = 'Amostra Digital Enviada') as ord_mockup
), meta_uf as (
  select m.uf, date_trunc('month', m.date)::date as mes, sum(m.spend) as spend, sum(m.leads) as leads_meta
  from public.meta_insights_daily m, lim
  where m.uf is not null and m.date between lim.ini and lim.fim
  group by 1, 2
), opp as (
  select o.id, c.uf, (o.created_at at time zone 'America/Sao_Paulo')::date as dia, o.stage_id
  from public.ghl_opportunities o
  join public.ghl_contacts c on c.id = o.contact_id, lim
  where c.uf is not null
    and (o.created_at at time zone 'America/Sao_Paulo')::date between lim.ini and lim.fim
    and not exists (select 1 from public.mv_contatos_importados i where i.contact_id = o.contact_id)
), leads_uf as (
  select opp.uf, date_trunc('month', opp.dia)::date as mes, count(*) as leads_ghl from opp group by 1, 2
), alcance as (
  select s.opportunity_id, max(coalesce(d.stage_order, 0)) as max_order
  from public.ghl_stage_snapshots s
  join opp on opp.id = s.opportunity_id and opp.dia < date '2026-07-16'
  left join public.dim_pipeline_stages d on d.stage_id = s.stage_id
  group by 1
), legado_uf as (
  select o.uf, date_trunc('month', o.dia)::date as mes,
    count(*) filter (where greatest(coalesce(a.max_order, 0), coalesce(dcur.stage_order, 0)) >= lim.ord_mockup) as mockups_legado
  from opp o
  cross join lim
  left join alcance a on a.opportunity_id = o.id
  left join public.dim_pipeline_stages dcur on dcur.stage_id = o.stage_id
  where o.dia < date '2026-07-16'
  group by 1, 2
), webhook_uf as (
  select upper(nullif(e.raw_payload ->> 'Estado', ''))::character(2) as uf,
    date_trunc('month', (e.received_at at time zone 'America/Sao_Paulo')::date)::date as mes,
    count(*) as mockups_webhook
  from public.ghl_funnel_events e, lim
  where e.stage_slug = 'solicitoumockupoficial'
    and (e.received_at at time zone 'America/Sao_Paulo')::date >= date '2026-07-16'
    and (e.received_at at time zone 'America/Sao_Paulo')::date between lim.ini and lim.fim
    and length(upper(nullif(e.raw_payload ->> 'Estado', ''))) = 2
    and not exists (select 1 from public.mv_contatos_importados i where i.contact_id = e.contact_id)
  group by 1, 2
), ghl_uf as (
  select coalesce(l.uf, lu.uf, wu.uf) as uf, coalesce(l.mes, lu.mes, wu.mes) as mes,
    coalesce(l.leads_ghl, 0) as leads_ghl,
    coalesce(lu.mockups_legado, 0) + coalesce(wu.mockups_webhook, 0) as mockups
  from leads_uf l
  full join legado_uf lu on lu.uf = l.uf and lu.mes = l.mes
  full join webhook_uf wu on wu.uf = coalesce(l.uf, lu.uf) and wu.mes = coalesce(l.mes, lu.mes)
), vendas_uf as (
  select p.uf, date_trunc('month', p.dia_venda)::date as mes,
    count(*) filter (where p.monetary_value > 0) as vendas,
    coalesce(sum(p.monetary_value), 0) as faturamento
  from public.v_pedidos_ganhos p, lim
  where p.uf is not null and p.dia_venda >= public.meta_inicio_coleta()
    and p.dia_venda between lim.ini and lim.fim
  group by 1, 2
)
select coalesce(m.uf, g.uf, ve.uf)::character(2), d.region_group,
  coalesce(m.mes, g.mes, ve.mes),
  public.estacao_do_mes(extract(month from coalesce(m.mes, g.mes, ve.mes))::integer),
  coalesce(m.spend, 0), coalesce(m.leads_meta, 0), coalesce(g.leads_ghl, 0)::bigint,
  coalesce(g.mockups, 0)::bigint, coalesce(ve.vendas, 0)::bigint, coalesce(ve.faturamento, 0)
from meta_uf m
full join ghl_uf g on g.uf = m.uf and g.mes = m.mes
full join vendas_uf ve on ve.uf = coalesce(m.uf, g.uf) and ve.mes = coalesce(m.mes, g.mes)
left join public.dim_region_group d on d.uf = coalesce(m.uf, g.uf, ve.uf)
$$;

revoke all on function public.get_desempenho_uf(date, date) from public, anon, authenticated;
grant execute on function public.get_desempenho_uf(date, date) to service_role;
