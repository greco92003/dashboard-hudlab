-- ============================================================
-- Arena gamificada, parte 2 (spec 2026-10-14-cami-intelligence-design, PR 6).
--
-- seller_training_sessions.mission_id: missão do treino (null = treino livre).
-- seller_training_sessions.comparacao_cami: "Você × Cami" do resultado,
--   guardado para não chamar a IA de novo a cada visita.
-- seller_achievements: conquistas liberadas (a data permite comemorar uma
--   vez só). Escrita só pelo servidor.
-- Aditiva: nada existente muda.
-- ============================================================

alter table public.seller_training_sessions
  add column if not exists mission_id text,
  add column if not exists comparacao_cami jsonb;

create table if not exists public.seller_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  achievement_id text not null,
  unlocked_at timestamptz not null default now(),
  context jsonb,
  unique (user_id, achievement_id)
);

alter table public.seller_achievements enable row level security;
drop policy if exists "read authenticated" on public.seller_achievements;
create policy "read authenticated" on public.seller_achievements for select to authenticated using (true);
drop policy if exists approved_user_gate on public.seller_achievements;
create policy approved_user_gate on public.seller_achievements
  as restrictive for all to authenticated
  using ((select private.is_approved_user()))
  with check ((select private.is_approved_user()));
revoke all on table public.seller_achievements from anon;
