-- ============================================================
-- Agente Comercial de Negociação — Auditor (nota final automática) e
-- Copiloto (coaching sob demanda) sobre conversas reais de WhatsApp na
-- etapa "Em Negociação".
-- Ver docs/superpowers/specs/2026-07-23-ghl-negotiation-sales-agent-design.md
-- ============================================================

-- Modo 1 (Auditor): uma linha por oportunidade, gravada quando a
-- negociação se resolve (won/lost). Escrita sempre via service role
-- (cron job), nunca pelo cliente autenticado — por isso não há política
-- de INSERT para "authenticated".
create table if not exists public.ghl_negotiation_evaluations (
  id                     uuid primary key default gen_random_uuid(),
  opportunity_id         text not null unique,
  contact_id             text not null,
  vendedor               text,
  outcome                text not null check (outcome in ('won', 'lost')),
  score                  int check (score is null or (score >= 0 and score <= 100)),
  classification         text,
  has_critical_error     boolean not null default false,
  report                 jsonb not null,
  manual_version         text not null,
  message_count          int not null default 0,
  negotiation_started_at timestamptz not null,
  resolved_at            timestamptz,
  evaluated_at           timestamptz not null default now()
);

comment on table public.ghl_negotiation_evaluations is
  'Modo Auditor: nota final (0-100), classificação e relatório estruturado por oportunidade fechada (won/lost) que passou por "Em Negociação". Um registro por oportunidade.';

create index if not exists idx_gne_vendedor on public.ghl_negotiation_evaluations (vendedor);
create index if not exists idx_gne_contact on public.ghl_negotiation_evaluations (contact_id);

alter table public.ghl_negotiation_evaluations enable row level security;

drop policy if exists "read authenticated" on public.ghl_negotiation_evaluations;
create policy "read authenticated" on public.ghl_negotiation_evaluations
  for select to authenticated using (true);

-- Modo 2 (Copiloto): histórico append-only de insights gerados sob
-- demanda para negociações ainda abertas. Escrita via service role,
-- disparada por uma rota autenticada (o usuário autenticado nunca
-- escreve direto na tabela).
create table if not exists public.ghl_negotiation_insights (
  id             uuid primary key default gen_random_uuid(),
  opportunity_id text not null,
  contact_id     text not null,
  vendedor       text,
  report         jsonb not null,
  manual_version text not null,
  message_count  int not null default 0,
  requested_by   uuid references auth.users (id),
  created_at     timestamptz not null default now()
);

comment on table public.ghl_negotiation_insights is
  'Modo Copiloto: histórico de orientações geradas sob demanda para negociações ainda abertas. Múltiplos registros por oportunidade (não sobrescreve).';

create index if not exists idx_gni_opportunity on public.ghl_negotiation_insights (opportunity_id);
create index if not exists idx_gni_contact on public.ghl_negotiation_insights (contact_id);

alter table public.ghl_negotiation_insights enable row level security;

drop policy if exists "read authenticated" on public.ghl_negotiation_insights;
create policy "read authenticated" on public.ghl_negotiation_insights
  for select to authenticated using (true);
