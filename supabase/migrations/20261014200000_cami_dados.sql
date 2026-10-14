-- ============================================================
-- Base de dados da Cami (spec 2026-10-14-cami-intelligence-design, PR 1).
--
-- ai_seller_settings: controle da Cami pelo dashboard (estado, faixa de
--   pares, quem recebe as passagens). Uma linha só. O código usa os valores
--   de config.ts se a leitura falhar.
-- ai_seller_assignments: cada chamada da entrada (assumiu ou ficou de fora,
--   com o motivo) — começo do funil da CAMI Intelligence.
-- ai_seller_handoffs: cada passagem da Cami para humano, e quando alguém
--   do time respondeu (alertas e "passagem sem resposta").
-- ai_seller_runs: horários para o tempo de resposta.
--
-- Leitura: aprovados. Escrita: o servidor (service role); a linha de
-- configuração também pelo owner, que é quem a muda pelo dashboard.
-- ============================================================

create table if not exists public.ai_seller_settings (
  id smallint primary key default 1 check (id = 1),
  estado text not null default 'ligada'
    check (estado in ('ligada', 'nao_pega_novos', 'desligada')),
  min_pares integer not null default 12 check (min_pares >= 12),
  max_pares integer not null default 12,
  escalation_user_id text,
  escalation_name text not null default 'Schay',
  escalation_shifts jsonb not null default '[["08:30","12:00"],["14:00","18:00"]]'::jsonb,
  alertas jsonb not null default '{"passagemSemRespostaMin":60,"ownerAposMin":120,"resumoDiario":"18:30"}'::jsonb,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint ai_seller_settings_faixa check (max_pares >= min_pares)
);

insert into public.ai_seller_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.ai_seller_assignments (
  id uuid primary key default gen_random_uuid(),
  contact_id text not null,
  opportunity_id text,
  pares integer,
  decisao text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_seller_assignments_created_idx
  on public.ai_seller_assignments (created_at desc);
create index if not exists ai_seller_assignments_contact_idx
  on public.ai_seller_assignments (contact_id, created_at desc);

create table if not exists public.ai_seller_handoffs (
  id uuid primary key default gen_random_uuid(),
  contact_id text not null,
  opportunity_id text,
  motivo text not null,
  resumo text,
  to_user_id text,
  escalated_at timestamptz not null default now(),
  answered_at timestamptz,
  answered_by text,
  alerted_at timestamptz,
  owner_alerted_at timestamptz
);

create index if not exists ai_seller_handoffs_escalated_idx
  on public.ai_seller_handoffs (escalated_at desc);
create index if not exists ai_seller_handoffs_pendentes_idx
  on public.ai_seller_handoffs (escalated_at)
  where answered_at is null;

alter table public.ai_seller_runs
  add column if not exists received_at timestamptz,
  add column if not exists client_message_at timestamptz,
  add column if not exists replied_at timestamptz;

-- RLS no padrão do projeto: leitura para aprovados, gate restritivo, anon fora.
do $$
declare t text;
begin
  foreach t in array array['ai_seller_settings', 'ai_seller_assignments', 'ai_seller_handoffs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "read authenticated" on public.%I', t);
    execute format('create policy "read authenticated" on public.%I for select to authenticated using (true)', t);
    execute format('drop policy if exists approved_user_gate on public.%I', t);
    execute format(
      'create policy approved_user_gate on public.%I as restrictive for all to authenticated '
      'using ((select private.is_approved_user())) with check ((select private.is_approved_user()))',
      t
    );
    execute format('revoke all on table public.%I from anon', t);
  end loop;
end $$;

drop policy if exists owner_update on public.ai_seller_settings;
create policy owner_update on public.ai_seller_settings
  for update to authenticated
  using (exists (select 1 from public.user_profiles p where p.id = (select auth.uid()) and p.role = 'owner'))
  with check (exists (select 1 from public.user_profiles p where p.id = (select auth.uid()) and p.role = 'owner'));
