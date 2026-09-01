-- Persist training sessions from the moment they start so navigation, reloads
-- and browser restarts never discard the timer or transcript.
alter table public.seller_training_sessions
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists deadline_at timestamptz,
  add column if not exists status text,
  add column if not exists evaluation jsonb,
  add column if not exists completion_reason text,
  add column if not exists model text,
  add column if not exists token_usage jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

-- Preserve the old sessions where ownership can be resolved unambiguously.
with profile_match as (
  select
    session.id as session_id,
    min(profile.id::text)::uuid as user_id
  from public.seller_training_sessions as session
  join public.user_profiles as profile
    on lower(trim(session.seller_name)) in (
      lower(trim(coalesce(profile.first_name, ''))),
      lower(trim(concat_ws(' ', profile.first_name, profile.last_name)))
    )
  where session.user_id is null
  group by session.id
  having count(*) = 1
)
update public.seller_training_sessions as session
set user_id = profile_match.user_id
from profile_match
where session.id = profile_match.session_id;

update public.seller_training_sessions
set
  deadline_at = coalesce(deadline_at, started_at + interval '15 minutes'),
  status = coalesce(
    status,
    case
      when ended_at is not null and score is not null then 'completed'
      when started_at + interval '15 minutes' <= now() then 'expired'
      else 'active'
    end
  ),
  ended_at = case
    when ended_at is null and started_at + interval '15 minutes' <= now()
      then started_at + interval '15 minutes'
    else ended_at
  end,
  score = case
    when score is null and started_at + interval '15 minutes' <= now() then 0
    else score
  end,
  completion_reason = case
    when completion_reason is null
      and ended_at is null
      and started_at + interval '15 minutes' <= now()
      then 'legacy_timeout'
    else completion_reason
  end,
  updated_at = now();

alter table public.seller_training_sessions
  alter column deadline_at set not null,
  alter column status set not null,
  alter column status set default 'active';

alter table public.seller_training_sessions
  drop constraint if exists seller_training_sessions_status_check,
  add constraint seller_training_sessions_status_check
    check (status in ('active', 'completed', 'expired', 'failed')),
  drop constraint if exists seller_training_sessions_score_check,
  add constraint seller_training_sessions_score_check
    check (score is null or score between 0 and 100);

create unique index if not exists seller_training_one_active_user_idx
  on public.seller_training_sessions (user_id)
  where status = 'active' and user_id is not null;

create index if not exists seller_training_user_started_idx
  on public.seller_training_sessions (user_id, started_at desc);

create index if not exists seller_training_status_deadline_idx
  on public.seller_training_sessions (status, deadline_at)
  where status = 'active';

alter table public.seller_training_sessions enable row level security;

drop policy if exists "Allow authenticated insert" on public.seller_training_sessions;
drop policy if exists "Allow authenticated read" on public.seller_training_sessions;
drop policy if exists "Allow authenticated update" on public.seller_training_sessions;
drop policy if exists seller_training_select_own on public.seller_training_sessions;
drop policy if exists seller_training_insert_own on public.seller_training_sessions;
drop policy if exists seller_training_update_own on public.seller_training_sessions;
drop policy if exists seller_training_delete_own on public.seller_training_sessions;

create policy seller_training_select_own
on public.seller_training_sessions
for select
to authenticated
using (user_id = (select auth.uid()));

create policy seller_training_insert_own
on public.seller_training_sessions
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy seller_training_update_own
on public.seller_training_sessions
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy seller_training_delete_own
on public.seller_training_sessions
for delete
to authenticated
using (user_id = (select auth.uid()));

revoke all on table public.seller_training_sessions from anon;
revoke all on table public.seller_training_sessions from authenticated;
grant select, insert, update, delete on table public.seller_training_sessions to authenticated;
grant select, insert, update, delete on table public.seller_training_sessions to service_role;

comment on column public.seller_training_sessions.deadline_at is
  'Absolute 15-minute deadline used to restore an active timer after reload.';
comment on column public.seller_training_sessions.evaluation is
  'Persisted auditor result displayed again when a completed session is reopened.';
