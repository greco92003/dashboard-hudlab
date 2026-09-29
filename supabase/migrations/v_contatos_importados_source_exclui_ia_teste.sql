-- ============================================================
-- Testadores da IA vendedora (tag ia-teste, ou oportunidade com prefixo
-- "(TESTE IA)") saem das métricas de negócio pelo mesmo caminho dos contatos
-- importados. NÃO saem de ghl_opportunities: o Copiloto e o Auditor leem de
-- lá, e é por eles que se mede a qualidade da IA.
-- A view materializada mv_contatos_importados é atualizada pelo cron
-- refresh-contatos-importados-30min (minutos 7 e 37).
-- ============================================================

create or replace view public.v_contatos_importados_source
with (security_invoker = true) as
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

  union

  -- ambiente de teste da IA vendedora
  select t.contact_id
  from public.ghl_contact_tags t
  where t.tag = 'ia-teste'

  union

  select e.contact_id
  from public.ghl_funnel_events e
  where 'ia-teste' = any (e.tags)

  union

  select o.contact_id
  from public.ghl_opportunities o
  where (o.raw -> 'contact' -> 'tags') ? 'ia-teste'
     or (o.raw ->> 'name') ilike '(TESTE IA)%'
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

revoke all on public.v_contatos_importados_source
  from public, anon, authenticated;
