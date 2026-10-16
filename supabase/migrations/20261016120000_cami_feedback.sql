-- ============================================================
-- Feedback por atendimento da Cami ("Ensinar a Cami", parte 1).
--
-- ai_seller_feedback: o que o owner ou quem recebe as passagens (Schay)
--   escreveu sobre um atendimento inteiro. Não muda a Cami na hora: os
--   feedbacks pendentes viram o anexo semanal, que o owner aprova.
--   urgente = vai direto para o owner, sem esperar segunda.
--
-- Leitura: aprovados. Escrita: só pelo servidor, depois de conferir quem pode.
-- ============================================================

create table if not exists public.ai_seller_feedback (
  id uuid primary key default gen_random_uuid(),
  opportunity_id text not null,
  contact_id text not null,
  author_id uuid not null,
  author_name text,
  texto text not null default '' check (length(texto) <= 2000),
  atalhos text[] not null default '{}',
  -- ids das mensagens da Cami marcadas no atendimento (opcional)
  mensagens text[] not null default '{}',
  urgente boolean not null default false,
  status text not null default 'pendente' check (status in ('pendente', 'usado', 'descartado')),
  -- versão do anexo que usou este feedback (parte 2)
  anexo_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists ai_seller_feedback_status_idx on public.ai_seller_feedback (status, created_at);
create index if not exists ai_seller_feedback_opportunity_idx on public.ai_seller_feedback (opportunity_id, created_at);

alter table public.ai_seller_feedback enable row level security;
drop policy if exists "read authenticated" on public.ai_seller_feedback;
create policy "read authenticated" on public.ai_seller_feedback for select to authenticated using (true);
drop policy if exists approved_user_gate on public.ai_seller_feedback;
create policy approved_user_gate on public.ai_seller_feedback as restrictive for all to authenticated
  using ((select private.is_approved_user())) with check ((select private.is_approved_user()));
revoke all on table public.ai_seller_feedback from anon;
