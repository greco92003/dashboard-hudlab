-- Histórico e cache incremental do agente de instruções de mockup.
-- A conversa completa permanece no GHL; guardamos somente o resumo acumulado
-- e o watermark da última mensagem para reduzir custo e exposição de dados.

create table if not exists public.ghl_mockup_conversation_cache (
  opportunity_id text primary key,
  contact_id text not null,
  conversation_id text not null,
  anchor_message_id text,
  anchor_message_at timestamptz,
  last_message_id text,
  last_message_at timestamptz,
  context_summary text not null default '',
  last_stage_name text,
  last_run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ghl_mockup_conversation_cache_contact_idx
  on public.ghl_mockup_conversation_cache (contact_id);

create table if not exists public.ghl_mockup_instruction_runs (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  opportunity_id text not null,
  contact_id text not null,
  conversation_id text,
  opportunity_name text not null,
  pipeline_id text not null,
  pipeline_stage_id text not null,
  stage_name text not null,
  instruction_type text not null
    check (instruction_type in ('initial', 'alteration')),
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'skipped', 'failed')),
  summary text,
  result_json jsonb,
  skip_reason text,
  error_message text,
  model text,
  transcription_model text,
  prompt_version text,
  cache_hit boolean not null default false,
  messages_read integer not null default 0,
  new_messages_processed integer not null default 0,
  images_processed integer not null default 0,
  audios_processed integer not null default 0,
  source_fields jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  note_id text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ghl_mockup_instruction_runs_opportunity_idx
  on public.ghl_mockup_instruction_runs (opportunity_id, created_at desc);
create index if not exists ghl_mockup_instruction_runs_stage_idx
  on public.ghl_mockup_instruction_runs (stage_name, created_at desc);
create index if not exists ghl_mockup_instruction_runs_status_idx
  on public.ghl_mockup_instruction_runs (status, created_at desc);

alter table public.ghl_mockup_conversation_cache enable row level security;
alter table public.ghl_mockup_instruction_runs enable row level security;

revoke all on table public.ghl_mockup_conversation_cache from public, anon;
revoke all on table public.ghl_mockup_instruction_runs from public, anon;
grant select on table public.ghl_mockup_conversation_cache to authenticated;
grant select on table public.ghl_mockup_instruction_runs to authenticated;
grant all on table public.ghl_mockup_conversation_cache to service_role;
grant all on table public.ghl_mockup_instruction_runs to service_role;

drop policy if exists "Authenticated users read mockup instruction cache"
  on public.ghl_mockup_conversation_cache;
create policy "Authenticated users read mockup instruction cache"
  on public.ghl_mockup_conversation_cache for select
  to authenticated using (true);

drop policy if exists "Authenticated users read mockup instruction history"
  on public.ghl_mockup_instruction_runs;
create policy "Authenticated users read mockup instruction history"
  on public.ghl_mockup_instruction_runs for select
  to authenticated using (true);

comment on table public.ghl_mockup_conversation_cache is
  'Resumo incremental e watermark da conversa GHL usado pelo agente de mockup.';
comment on table public.ghl_mockup_instruction_runs is
  'Track record imutável das execuções do agente de instruções de mockup.';
