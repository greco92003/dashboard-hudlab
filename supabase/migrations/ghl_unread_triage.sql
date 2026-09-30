-- ============================================================
-- Triagem das conversas não lidas de WhatsApp (arena de vendedores, aba
-- Atendimentos Reais). Uma linha por conversa do GHL. O botão "Atualizar"
-- reescreve a fila; a classificação (quente/morno/frio/pós-venda) e o
-- insight ficam guardados com o id da mensagem em que foram gerados, para
-- só refazer quando chega mensagem nova.
-- ============================================================

create table if not exists public.ghl_unread_triage (
  conversation_id text primary key,
  contact_id text not null,
  contact_name text,
  phone text,
  opportunity_id text,
  pipeline_name text,
  stage_name text,
  vendedor text,
  qty_pares integer,
  monetary_value numeric,
  unread_count integer not null default 0,
  last_inbound_at timestamptz not null,
  last_message_id text,
  last_message_body text,
  is_unread boolean not null default true,
  category text check (category in ('quente', 'morno', 'frio', 'pos_venda')),
  reason text,
  subject text,
  classified_message_id text,
  classified_at timestamptz,
  classify_error text,
  insight jsonb,
  insight_message_id text,
  insight_at timestamptz,
  refreshed_at timestamptz not null default now()
);

create index if not exists ghl_unread_triage_unread_idx
  on public.ghl_unread_triage (is_unread, last_inbound_at);

alter table public.ghl_unread_triage enable row level security;

drop policy if exists "read authenticated" on public.ghl_unread_triage;
create policy "read authenticated" on public.ghl_unread_triage
  for select to authenticated
  using (true);

drop policy if exists approved_user_gate on public.ghl_unread_triage;
create policy approved_user_gate on public.ghl_unread_triage
  as restrictive for all to authenticated
  using ((select private.is_approved_user()))
  with check ((select private.is_approved_user()));

revoke all on table public.ghl_unread_triage from anon;
