-- Package 2: database authorization hardening.
-- Keep privileged writes behind server-side clients using DASHBOARD_SECRET.

create schema if not exists private;

create or replace function private.is_approved_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles
    where id = (select auth.uid())
      and approved is true
  );
$$;

create or replace function private.is_admin_or_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles
    where id = (select auth.uid())
      and approved is true
      and role in ('admin', 'owner')
  );
$$;

create or replace function private.can_manage_nct()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles
    where id = (select auth.uid())
      and approved is true
      and role in ('admin', 'owner', 'manager', 'team-leader')
  );
$$;

revoke all on function private.is_approved_user() from public;
revoke all on function private.is_admin_or_owner() from public;
revoke all on function private.can_manage_nct() from public;
grant usage on schema private to authenticated, service_role;
grant execute on function private.is_approved_user() to authenticated, service_role;
grant execute on function private.is_admin_or_owner() to authenticated, service_role;
grant execute on function private.can_manage_nct() to authenticated, service_role;

-- This is an authenticated internal application: anonymous Data API access is
-- not required. RLS does not cover TRUNCATE, so remove that privilege globally.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public
  revoke truncate, references, trigger on tables from authenticated;

-- Every authenticated-facing table except the onboarding profile requires an
-- approved account. Existing ownership/role policies still apply in addition.
do $$
declare
  table_name text;
begin
  for table_name in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and tablename <> 'user_profiles'
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists approved_user_gate on public.%I', table_name);
    execute format(
      'create policy approved_user_gate on public.%I as restrictive for all to authenticated using ((select private.is_approved_user())) with check ((select private.is_approved_user()))',
      table_name
    );
  end loop;
end;
$$;

-- Temporary backup tables must never be reachable through the Data API.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'deals_cache_dup_bkp_20260703',
    'deals_live_dup_bkp_20260703',
    'deals_cache_stale_won_bkp_20260710',
    'deals_live_stale_won_bkp_20260710'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
  end loop;
end;
$$;

-- Operational datasets: approved users may read; browser clients may not write.
do $$
declare
  table_name text;
  policy record;
begin
  foreach table_name in array array[
    'deals_cache',
    'deals_live',
    'deals_processed_tracking',
    'designer_mockups_cache',
    'programacao_cache',
    'nuvemshop_orders',
    'nuvemshop_products'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    for policy in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = table_name
    loop
      execute format('drop policy if exists %I on public.%I', policy.policyname, table_name);
    end loop;
    execute format(
      'create policy approved_read on public.%I for select to authenticated using ((select private.is_approved_user()))',
      table_name
    );
    execute format('revoke all on table public.%I from anon', table_name);
    execute format(
      'revoke insert, update, delete, truncate, references, trigger on table public.%I from authenticated',
      table_name
    );
    execute format('grant select on table public.%I to authenticated', table_name);
  end loop;
end;
$$;

-- Logs, integration control tables and archived leads are administrative only.
do $$
declare
  table_name text;
  policy record;
begin
  foreach table_name in array array[
    'deals_sync_log',
    'designer_mockups_sync_log',
    'nuvemshop_sync_log',
    'nuvemshop_webhooks',
    'nuvemshop_webhook_logs',
    'nuvemshop_webhook_stats',
    'manychat_archived_leads',
    'manychat_tag_events'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    for policy in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = table_name
    loop
      execute format('drop policy if exists %I on public.%I', policy.policyname, table_name);
    end loop;
    execute format(
      'create policy admin_read on public.%I for select to authenticated using ((select private.is_admin_or_owner()))',
      table_name
    );
    execute format('revoke all on table public.%I from anon', table_name);
    execute format(
      'revoke insert, update, delete, truncate, references, trigger on table public.%I from authenticated',
      table_name
    );
    execute format('grant select on table public.%I to authenticated', table_name);
  end loop;
end;
$$;

-- Financial/configuration tables are managed only by approved admins/owners.
do $$
declare
  table_name text;
  policy record;
begin
  foreach table_name in array array[
    'fixed_costs',
    'variable_costs',
    'direct_costs',
    'taxes',
    'tools_costs',
    'tools_cost_history'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    for policy in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = table_name
    loop
      execute format('drop policy if exists %I on public.%I', policy.policyname, table_name);
    end loop;
    execute format(
      'create policy admin_manage on public.%I for all to authenticated using ((select private.is_admin_or_owner())) with check ((select private.is_admin_or_owner()))',
      table_name
    );
    execute format('revoke all on table public.%I from anon', table_name);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
  end loop;
end;
$$;

-- Values/settings can be read by approved users and managed by admins.
do $$
declare
  table_name text;
  policy record;
begin
  foreach table_name in array array['pair_values', 'partners_commission_settings'] loop
    execute format('alter table public.%I enable row level security', table_name);
    for policy in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = table_name
    loop
      execute format('drop policy if exists %I on public.%I', policy.policyname, table_name);
    end loop;
    execute format(
      'create policy approved_read on public.%I for select to authenticated using ((select private.is_approved_user()))',
      table_name
    );
    execute format(
      'create policy admin_manage on public.%I for all to authenticated using ((select private.is_admin_or_owner())) with check ((select private.is_admin_or_owner()))',
      table_name
    );
    execute format('revoke all on table public.%I from anon', table_name);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
  end loop;
end;
$$;

-- Program scheduling state is intentionally shared, but only among approved users.
do $$
declare
  policy record;
begin
  for policy in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'programacao_card_states'
  loop
    execute format(
      'drop policy if exists %I on public.programacao_card_states',
      policy.policyname
    );
  end loop;
end;
$$;

create policy approved_manage
on public.programacao_card_states
for all
to authenticated
using ((select private.is_approved_user()))
with check ((select private.is_approved_user()));

revoke all on table public.programacao_card_states from anon;
grant select, insert, update, delete on table public.programacao_card_states to authenticated;

-- Unapproved accounts may see and edit only their own non-security profile fields.
do $$
declare
  policy record;
begin
  for policy in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'user_profiles'
  loop
    execute format('drop policy if exists %I on public.user_profiles', policy.policyname);
  end loop;
end;
$$;

create policy profile_read
on public.user_profiles
for select
to authenticated
using (id = (select auth.uid()) or (select private.is_approved_user()));

create policy profile_insert_self
on public.user_profiles
for insert
to authenticated
with check (
  id = (select auth.uid())
  and role = 'user'
  and approved is false
);

create policy profile_update_self
on public.user_profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

revoke all on table public.user_profiles from anon;
revoke update, delete on table public.user_profiles from authenticated;
grant select, insert on table public.user_profiles to authenticated;
grant update (first_name, last_name, avatar_url, sector, updated_at)
on table public.user_profiles
to authenticated;

-- Require approval in the remaining user-facing tables without replacing their
-- ownership/role-specific policies. Restrictive policies are ANDed with them.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'nct_setores',
    'nct_narrativas',
    'nct_compromissos',
    'nct_tarefas',
    'nct_xp_log',
    'nct_ranking_snapshots',
    'nct_badges',
    'nct_user_badges',
    'nct_narrativa_participantes',
    'nct_comentarios',
    'nct_narrativa_setores',
    'seller_training_sessions',
    'goals'
  ] loop
    execute format('drop policy if exists approved_user_gate on public.%I', table_name);
    execute format(
      'create policy approved_user_gate on public.%I as restrictive for all to authenticated using ((select private.is_approved_user())) with check ((select private.is_approved_user()))',
      table_name
    );
    execute format('revoke all on table public.%I from anon', table_name);
  end loop;
end;
$$;

-- Security-definer functions are denied by default. Only narrowly scoped RPCs
-- used by authenticated browser clients are granted back below.
do $$
declare
  function_row record;
begin
  for function_row in
    select format(
      '%I.%I(%s)',
      n.nspname,
      p.proname,
      pg_get_function_identity_arguments(p.oid)
    ) as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format(
      'revoke execute on function %s from public, anon, authenticated',
      function_row.signature
    );
    execute format(
      'grant execute on function %s to service_role',
      function_row.signature
    );
  end loop;
end;
$$;

-- Read-only brand lookup should obey caller RLS instead of bypassing it.
create or replace function public.get_available_brands()
returns table(brand text, product_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select products.brand, count(*) as product_count
  from public.nuvemshop_products as products
  where products.brand is not null
    and products.brand <> ''
    and products.sync_status = 'synced'
  group by products.brand
  order by products.brand;
$$;
grant execute on function public.get_available_brands() to authenticated;

-- Notification RPCs remain definer functions but cannot act on another user.
create or replace function public.get_unread_notifications_count(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is distinct from p_user_id then 0
    else (
      select count(*)::integer
      from public.user_notifications
      where user_id = p_user_id and is_read is false
    )
  end;
$$;

create or replace function public.mark_notification_as_read(
  p_notification_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is distinct from p_user_id then
    return false;
  end if;

  update public.user_notifications
  set is_read = true, read_at = now(), updated_at = now()
  where notification_id = p_notification_id
    and user_id = p_user_id
    and is_read is false;

  return found;
end;
$$;

create or replace function public.mark_all_notifications_as_read(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  if (select auth.uid()) is distinct from p_user_id then
    return 0;
  end if;

  update public.user_notifications
  set is_read = true, read_at = now(), updated_at = now()
  where user_id = p_user_id and is_read is false;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke execute on function public.get_unread_notifications_count(uuid) from public, anon;
revoke execute on function public.mark_notification_as_read(uuid, uuid) from public, anon;
revoke execute on function public.mark_all_notifications_as_read(uuid) from public, anon;
grant execute on function public.get_unread_notifications_count(uuid) to authenticated;
grant execute on function public.mark_notification_as_read(uuid, uuid) to authenticated;
grant execute on function public.mark_all_notifications_as_read(uuid) to authenticated;

-- These helpers are referenced by existing RLS policies. They expose only
-- caller-scoped booleans/text and remain callable by authenticated users.
grant execute on function public.has_role(text) to authenticated;
grant execute on function public.is_partners_media() to authenticated;
grant execute on function public.is_team_leader() to authenticated;
grant execute on function public.get_team_leader_setor() to authenticated;
grant execute on function public.get_role_level(text) to authenticated;
grant execute on function public.can_manage_role(text) to authenticated;

-- Storage mutation policies. Public reads remain for currently public assets,
-- while writes require an approved account and appropriate scope.
drop policy if exists "Allow all avatar uploads" on storage.objects;
drop policy if exists "Debug: Allow all avatar uploads" on storage.objects;
drop policy if exists "Users can delete their own avatar" on storage.objects;
drop policy if exists "Users can update their own avatar" on storage.objects;

create policy avatars_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select private.is_approved_user())
);

create policy avatars_update_own
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select private.is_approved_user())
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select private.is_approved_user())
);

create policy avatars_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select private.is_approved_user())
);

drop policy if exists "Allow public upload to contracts bucket" on storage.objects;
drop policy if exists "Allow public update to contracts bucket" on storage.objects;

create policy contracts_insert_approved
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'representantes-contratos'
  and (select private.is_approved_user())
);

create policy contracts_update_approved
on storage.objects
for update
to authenticated
using (
  bucket_id = 'representantes-contratos'
  and (select private.is_approved_user())
)
with check (
  bucket_id = 'representantes-contratos'
  and (select private.is_approved_user())
);

drop policy if exists "nct_narrativas_storage_upload" on storage.objects;
drop policy if exists "nct_narrativas_storage_update" on storage.objects;
drop policy if exists "nct_narrativas_storage_delete" on storage.objects;

create policy nct_assets_insert_manager
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'nct-narrativas'
  and (select private.can_manage_nct())
);

create policy nct_assets_update_manager
on storage.objects
for update
to authenticated
using (
  bucket_id = 'nct-narrativas'
  and (select private.can_manage_nct())
)
with check (
  bucket_id = 'nct-narrativas'
  and (select private.can_manage_nct())
);

create policy nct_assets_delete_manager
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'nct-narrativas'
  and (select private.can_manage_nct())
);

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id = 'avatars';

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id = 'nct-narrativas';
