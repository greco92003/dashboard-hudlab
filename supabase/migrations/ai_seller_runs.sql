-- ============================================================
-- Registro da IA vendedora: uma linha por acionamento do endpoint
-- /api/ai-seller/respond (spec 2026-09-29-ia-vendedora-nucleo-conversa).
-- sent_message_ids é o que prova quais falas da conversa são da IA — a
-- detecção de "humano assumiu" e de "já respondido" depende dele.
-- ============================================================

create table if not exists public.ai_seller_runs (
  id uuid primary key default gen_random_uuid(),
  contact_id text not null,
  opportunity_id text,
  triggered_at timestamptz not null default now(),
  decision text not null,
  escalation_reason text,
  tool_calls jsonb not null default '[]'::jsonb,
  sent_message_ids text[] not null default '{}',
  model text,
  usage jsonb,
  latency_ms integer,
  error text
);

create index if not exists ai_seller_runs_contact_triggered_idx
  on public.ai_seller_runs (contact_id, triggered_at desc);

alter table public.ai_seller_runs enable row level security;

drop policy if exists "read authenticated" on public.ai_seller_runs;
create policy "read authenticated" on public.ai_seller_runs
  for select to authenticated
  using (true);

drop policy if exists approved_user_gate on public.ai_seller_runs;
create policy approved_user_gate on public.ai_seller_runs
  as restrictive for all to authenticated
  using ((select private.is_approved_user()))
  with check ((select private.is_approved_user()));

revoke all on table public.ai_seller_runs from anon;
