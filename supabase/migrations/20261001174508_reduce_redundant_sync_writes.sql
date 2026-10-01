-- Daily Meta and GHL syncs revisit recent rows. Ignore an upsert whose only
-- difference is the sync timestamp; otherwise PostgreSQL writes a new tuple,
-- updates indexes, and emits WAL even though the business data did not move.
create or replace function public.skip_unchanged_marketing_sync_row()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if to_jsonb(new) - 'synced_at' = to_jsonb(old) - 'synced_at' then
    return null;
  end if;
  return new;
end;
$$;

-- Restrict the historical snapshot scan to opportunities in the requested
-- cohort. The previous query grouped every snapshot in the database for each
-- dashboard visit, even when the user selected only the last few days.
CREATE OR REPLACE FUNCTION public.get_funil_etapas(p_inicio date, p_fim date)
 RETURNS TABLE(pipeline_id text, stage_id text, stage_name text, stage_order integer, qtd bigint, custo_por_oportunidade numeric, pct_primeira_etapa numeric, pct_etapa_anterior numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with marcos as (
    select
      (select stage_order from public.dim_pipeline_stages where stage_name = 'Orçamento Gerado') as ord_orcamento,
      (select stage_order from public.dim_pipeline_stages where stage_name = 'Amostra Digital Enviada') as ord_mockup,
      (select stage_order from public.dim_pipeline_stages where stage_name = 'Negociação') as ord_negociacao
  ),
  coorte as (
    select o.id, o.created_at, o.stage_id
    from public.ghl_opportunities o
    where (o.created_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
      and o.contact_id not in (select contact_id from public.v_contatos_importados)
  ),
  alcance as (
    select s.opportunity_id, max(coalesce(d.stage_order, 0)) as max_order
    from coorte c
    join public.ghl_stage_snapshots s on s.opportunity_id = c.id
    left join public.dim_pipeline_stages d on d.stage_id = s.stage_id
    group by s.opportunity_id
  ),
  opp as (
    select
      c.id, c.created_at,
      greatest(coalesce(a.max_order, 0), coalesce(dcur.stage_order, 0)) as max_order
    from coorte c
    left join alcance a on a.opportunity_id = c.id
    left join public.dim_pipeline_stages dcur on dcur.stage_id = c.stage_id
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

-- One dashboard button click starts two full background syncs. Serialize
-- requests across Vercel instances and users so repeated clicks reuse the
-- recent run instead of rewriting the same database rows.
create schema if not exists private;
create table if not exists private.marketing_refresh_gate (
  name text primary key,
  claimed_at timestamptz not null
);

create or replace function public.try_claim_marketing_refresh()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
begin
  insert into private.marketing_refresh_gate (name, claimed_at)
  values ('meta-ghl', now())
  on conflict (name) do update
    set claimed_at = excluded.claimed_at
    where marketing_refresh_gate.claimed_at < now() - interval '30 minutes';
  return found;
end;
$$;

create or replace function public.release_marketing_refresh()
returns void
language sql
security definer
set search_path = pg_catalog, private
as $$
  delete from private.marketing_refresh_gate where name = 'meta-ghl';
$$;

revoke all on function public.try_claim_marketing_refresh() from public, anon, authenticated;
revoke all on function public.release_marketing_refresh() from public, anon, authenticated;
grant execute on function public.try_claim_marketing_refresh() to service_role;
grant execute on function public.release_marketing_refresh() to service_role;

drop trigger if exists skip_unchanged_ghl_opportunity on public.ghl_opportunities;
create trigger skip_unchanged_ghl_opportunity
before update on public.ghl_opportunities
for each row execute function public.skip_unchanged_marketing_sync_row();

drop trigger if exists skip_unchanged_meta_insight on public.meta_insights_daily;
create trigger skip_unchanged_meta_insight
before update on public.meta_insights_daily
for each row execute function public.skip_unchanged_marketing_sync_row();

-- Supabase's performance advisor identified these as exact duplicates.
-- Keeping one index per lookup preserves the plan and reduces index writes.
drop index if exists public.idx_ghlo_contact_id;
drop index if exists public.idx_ghss_opportunity;

-- Completion timestamps live in sync_log once unchanged won deals stop
-- receiving artificial per-row last_synced_at updates every 15 minutes.
create index if not exists idx_sync_log_source_finished_at
  on public.sync_log (source, finished_at desc);

-- The snapshot is a historical daily state, not an activity log. Re-running
-- sync-ghl on the same day should update only opportunities that actually
-- changed stage, status, pipeline, or value.
create or replace function public.fn_snapshot_stages()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_rows integer;
begin
  insert into public.ghl_stage_snapshots
    (snapshot_date, opportunity_id, pipeline_id, stage_id, stage_name, status, monetary_value)
  select
    (now() at time zone 'America/Sao_Paulo')::date,
    id, pipeline_id, stage_id, stage_name, status, monetary_value
  from public.ghl_opportunities
  on conflict (snapshot_date, opportunity_id) do update set
    pipeline_id = excluded.pipeline_id,
    stage_id = excluded.stage_id,
    stage_name = excluded.stage_name,
    status = excluded.status,
    monetary_value = excluded.monetary_value
  where (ghl_stage_snapshots.pipeline_id,
         ghl_stage_snapshots.stage_id,
         ghl_stage_snapshots.stage_name,
         ghl_stage_snapshots.status,
         ghl_stage_snapshots.monetary_value)
    is distinct from
        (excluded.pipeline_id,
         excluded.stage_id,
         excluded.stage_name,
         excluded.status,
         excluded.monetary_value);
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;
