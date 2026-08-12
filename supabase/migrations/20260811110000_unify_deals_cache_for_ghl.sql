-- Keep one physical deals cache while preserving the ActiveCampaign snapshot
-- during the GHL cutover. New reads select source_system = 'ghl'.

alter table public.deals_cache
  add column if not exists source_system text not null default 'activecampaign',
  add column if not exists source_id text,
  add column if not exists pipeline_id text,
  add column if not exists stage_title text,
  add column if not exists data_embarque text,
  add column if not exists assigned_to text,
  add column if not exists provider_payload jsonb;

-- GHL monetaryValue is converted to centavos. A few legacy/open
-- opportunities exceed the precision of the original AC-oriented column.
-- PostgreSQL requires the dependent view to be recreated for a type change.
drop view if exists public.deals_by_period;

alter table public.deals_cache
  alter column value type numeric(18, 2) using value::numeric(18, 2);

create view public.deals_by_period as
select
  id, deal_id, title, value, currency, status, stage_id, closing_date,
  created_date, custom_field_value, custom_field_id, contact_id,
  organization_id, last_synced_at, api_updated_at, sync_status,
  sync_error_message, created_at, updated_at,
  extract(epoch from (closing_date - created_date)) / 86400::numeric
    as days_to_close
from public.deals_cache
where sync_status = 'synced' and closing_date is not null;

grant all on table public.deals_by_period to authenticated, service_role;

update public.deals_cache
set source_id = deal_id
where source_id is null;

alter table public.deals_cache
  drop constraint if exists deals_cache_source_system_check;

alter table public.deals_cache
  add constraint deals_cache_source_system_check
  check (source_system in ('activecampaign', 'ghl'));

create unique index if not exists idx_deals_cache_source_identity
  on public.deals_cache (source_system, source_id)
  where source_id is not null;

create index if not exists idx_deals_cache_ghl_closing_date
  on public.deals_cache (closing_date desc)
  where source_system = 'ghl' and sync_status = 'synced';

create index if not exists idx_deals_cache_ghl_status
  on public.deals_cache (status)
  where source_system = 'ghl' and sync_status = 'synced';

comment on column public.deals_cache.source_system is
  'CRM that owns the canonical row: activecampaign or ghl.';
comment on column public.deals_cache.source_id is
  'Provider-native deal/opportunity identifier.';
comment on column public.deals_cache.provider_payload is
  'Provider payload retained for mapping audits and forward-compatible fields.';
