-- A lista de contatos importados combina várias tabelas e era recalculada em
-- cada leitura de vendas/funil. Isso mantinha conexões PostgREST ocupadas por
-- dezenas de segundos e acabava bloqueando até a autenticação do middleware.

create or replace view public.v_contatos_importados_source as
with dias_rajada as materialized (
  select (o.created_at at time zone 'America/Sao_Paulo')::date as dia
  from public.ghl_opportunities o
  group by 1
  having count(*) > 1000
),
candidatos as (
  select distinct t.contact_id
  from public.ghl_contact_tags t
  where t.tag ilike '%import%'

  union

  select e.contact_id
  from public.ghl_funnel_events e
  where exists (
    select 1 from unnest(e.tags) as tag where tag ilike '%import%'
  )

  union

  select o.contact_id
  from public.ghl_opportunities o
  join dias_rajada d
    on d.dia = (o.created_at at time zone 'America/Sao_Paulo')::date
  left join public.ghl_contacts c on c.id = o.contact_id
  where c.id is null

  union

  select o.contact_id
  from public.ghl_opportunities o
  where (o.raw ->> 'source') ilike '%activecampaign migration%'
),
venda_real_fora_da_rajada as (
  select distinct o.contact_id
  from public.ghl_opportunities o
  where o.status = 'won'
    and o.monetary_value > 0
    and not exists (
      select 1
      from dias_rajada d
      where d.dia = (o.won_at at time zone 'America/Sao_Paulo')::date
    )
)
select c.contact_id
from candidatos c
where not exists (
  select 1
  from venda_real_fora_da_rajada v
  where v.contact_id = c.contact_id
);

create materialized view public.mv_contatos_importados as
select contact_id
from public.v_contatos_importados_source;

create unique index mv_contatos_importados_contact_id_idx
  on public.mv_contatos_importados (contact_id);

create or replace view public.v_contatos_importados as
select contact_id
from public.mv_contatos_importados;

-- Atualiza fora dos horários dos demais crons (minutos 7 e 37).
select cron.schedule(
  'refresh-contatos-importados-30min',
  '7,37 * * * *',
  'refresh materialized view concurrently public.mv_contatos_importados'
);
