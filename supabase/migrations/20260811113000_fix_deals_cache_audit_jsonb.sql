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
      'updated_at', 'last_synced_at', 'last_change_source',
      'last_request_id', 'provider_payload'
    ];
    audit_source := coalesce(new.last_change_source, 'unknown');
    audit_request_id := new.last_request_id;
    audit_deal_id := new.deal_id;
    select coalesce(array_agg(key order by key), '{}')
      into fields
      from jsonb_object_keys(after_payload) as keys(key);
  elsif tg_op = 'DELETE' then
    before_payload := to_jsonb(old) - array[
      'updated_at', 'last_synced_at', 'last_change_source',
      'last_request_id', 'provider_payload'
    ];
    audit_source := coalesce(old.last_change_source, 'unknown');
    audit_request_id := old.last_request_id;
    audit_deal_id := old.deal_id;
    select coalesce(array_agg(key order by key), '{}')
      into fields
      from jsonb_object_keys(before_payload) as keys(key);
  else
    before_payload := to_jsonb(old) - array[
      'updated_at', 'last_synced_at', 'last_change_source',
      'last_request_id', 'provider_payload'
    ];
    after_payload := to_jsonb(new) - array[
      'updated_at', 'last_synced_at', 'last_change_source',
      'last_request_id', 'provider_payload'
    ];

    if before_payload = after_payload then return new; end if;

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
    deal_id, operation, source, request_id, changed_fields,
    before_data, after_data
  ) values (
    audit_deal_id, tg_op, audit_source, audit_request_id,
    coalesce(fields, '{}'), before_payload, after_payload
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.audit_deals_cache_change()
  from public, anon, authenticated;
grant execute on function private.audit_deals_cache_change() to service_role;
