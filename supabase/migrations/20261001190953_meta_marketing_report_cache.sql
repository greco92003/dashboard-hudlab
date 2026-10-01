-- Private report snapshots avoid repeating the same expensive aggregations
-- for every viewer and every tab. The browser never reads this table directly.
create table public.meta_marketing_report_cache (
  cache_key text primary key,
  report_name text not null,
  period_start date not null,
  period_end date not null,
  payload jsonb,
  refreshed_at timestamptz,
  expires_at timestamptz,
  claim_started_at timestamptz
);

alter table public.meta_marketing_report_cache enable row level security;
revoke all on public.meta_marketing_report_cache from anon, authenticated;
grant select, insert, update on public.meta_marketing_report_cache to service_role;

-- Atomic claim across Vercel instances. A crashed worker can be retried after
-- two minutes while preserving its last successful payload.
create function public.try_claim_meta_marketing_report(p_cache_key text,
  p_report_name text, p_inicio date, p_fim date)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_claimed text;
begin
  insert into public.meta_marketing_report_cache
    (cache_key, report_name, period_start, period_end, claim_started_at)
  values (p_cache_key, p_report_name, p_inicio, p_fim, now())
  on conflict (cache_key) do update
    set claim_started_at = excluded.claim_started_at
    where meta_marketing_report_cache.claim_started_at is null
       or meta_marketing_report_cache.claim_started_at < now() - interval '2 minutes'
  returning cache_key into v_claimed;
  return v_claimed is not null;
end;
$$;

revoke all on function public.try_claim_meta_marketing_report(text,text,date,date)
  from public, anon, authenticated;
grant execute on function public.try_claim_meta_marketing_report(text,text,date,date)
  to service_role;
