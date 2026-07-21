-- Consolidate ActiveCampaign deal state in deals_cache and keep a row-level
-- audit trail for business-field changes.

alter table public.deals_cache
  add column if not exists last_change_source text not null default 'legacy',
  add column if not exists last_request_id text;

alter table public.deals_sync_log
  add column if not exists sync_source text not null default 'legacy',
  add column if not exists request_id text;

alter table public.deals_sync_log
  drop constraint if exists deals_sync_log_sync_source_check;

alter table public.deals_sync_log
  add constraint deals_sync_log_sync_source_check
  check (sync_source in ('cron', 'manual', 'legacy', 'unknown'));

alter table public.deals_cache
  drop constraint if exists deals_cache_last_change_source_check;

alter table public.deals_cache
  add constraint deals_cache_last_change_source_check
  check (last_change_source in ('webhook', 'cron', 'manual', 'validator', 'legacy', 'unknown'));

comment on column public.deals_cache.last_change_source is
  'Application path that last wrote this deal: webhook, cron, manual, validator, legacy, or unknown.';

comment on column public.deals_cache.last_request_id is
  'Vercel request ID or generated correlation ID for the last write.';

create table if not exists public.deals_change_log (
  id uuid primary key default gen_random_uuid(),
  deal_id text not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  source text not null,
  request_id text,
  changed_fields text[] not null default '{}',
  before_data jsonb,
  after_data jsonb,
  changed_at timestamptz not null default now()
);

comment on table public.deals_change_log is
  'Immutable row-level audit trail for business changes made to deals_cache.';

create index if not exists idx_deals_change_log_deal_time
  on public.deals_change_log (deal_id, changed_at desc);

create index if not exists idx_deals_change_log_source_time
  on public.deals_change_log (source, changed_at desc);

alter table public.deals_change_log enable row level security;

revoke all on table public.deals_change_log from anon, authenticated;
grant select, insert on table public.deals_change_log to service_role;

create or replace function private.audit_deals_cache_change()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  before_payload jsonb;
  after_payload jsonb;
  audit_source text;
  audit_request_id text;
  audit_deal_id text;
  fields text[];
begin
  if tg_op = 'INSERT' then
    after_payload := to_jsonb(new) - array[
      'updated_at', 'last_synced_at', 'last_change_source', 'last_request_id'
    ];
    audit_source := coalesce(new.last_change_source, 'unknown');
    audit_request_id := new.last_request_id;
    audit_deal_id := new.deal_id;
    fields := akeys(after_payload);
  elsif tg_op = 'DELETE' then
    before_payload := to_jsonb(old) - array[
      'updated_at', 'last_synced_at', 'last_change_source', 'last_request_id'
    ];
    audit_source := coalesce(old.last_change_source, 'unknown');
    audit_request_id := old.last_request_id;
    audit_deal_id := old.deal_id;
    fields := akeys(before_payload);
  else
    before_payload := to_jsonb(old) - array[
      'updated_at', 'last_synced_at', 'last_change_source', 'last_request_id'
    ];
    after_payload := to_jsonb(new) - array[
      'updated_at', 'last_synced_at', 'last_change_source', 'last_request_id'
    ];

    -- Do not create audit noise for heartbeat/timestamp-only sync updates.
    if before_payload = after_payload then
      return new;
    end if;

    audit_source := coalesce(new.last_change_source, 'unknown');
    audit_request_id := new.last_request_id;
    audit_deal_id := new.deal_id;

    select coalesce(array_agg(diff.key order by diff.key), '{}')
      into fields
    from (
      select coalesce(b.key, a.key) as key
      from jsonb_each(before_payload) as b(key, value)
      full join jsonb_each(after_payload) as a(key, value) using (key)
      where b.value is distinct from a.value
    ) as diff;
  end if;

  insert into public.deals_change_log (
    deal_id,
    operation,
    source,
    request_id,
    changed_fields,
    before_data,
    after_data
  ) values (
    audit_deal_id,
    tg_op,
    audit_source,
    audit_request_id,
    coalesce(fields, '{}'),
    before_payload,
    after_payload
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function private.audit_deals_cache_change() from public, anon, authenticated;
grant execute on function private.audit_deals_cache_change() to service_role;

drop trigger if exists audit_deals_cache_change on public.deals_cache;
create trigger audit_deals_cache_change
after insert or update or delete on public.deals_cache
for each row execute function private.audit_deals_cache_change();

-- deals_live was an obsolete secondary copy. No application route reads it.
drop table if exists public.deals_live;
