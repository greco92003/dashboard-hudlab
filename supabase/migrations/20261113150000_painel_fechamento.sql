-- ============================================================
-- Painel de fechamento (13/11/2026): uma linha por card aberto nas etapas
-- Quero aproveitar, Prioridade de Fechamento e Finalizando Venda do funil
-- Atendimento. A rotina /api/cron/fechamento relê o GHL a cada 10 min no
-- turno; a cor e o prazo do follow-up são calculados na leitura
-- (lib/fechamento/regras.ts). A tarefa de follow-up de cada card fica no GHL
-- (ghl_task_id). fechamento_eventos guarda o que a vendedora fez no painel,
-- inclusive o motivo de cada perda.
-- ============================================================

create table if not exists public.fechamento_cards (
  opportunity_id text primary key,
  contact_id text not null,
  contact_name text,
  stage_name text not null,
  monetary_value numeric,
  qty_pares integer,
  assigned_to text,
  na_etapa_desde timestamptz,
  conversation_id text,
  -- Última atividade da conversa no GHL: se não mudou, as mensagens não são relidas.
  conversa_atualizada_em timestamptz,
  ultima_cliente_em timestamptz,
  ultima_cliente_id text,
  ultima_cliente_texto text,
  ultima_nossa_em timestamptz,
  cliente_esperando boolean not null default false,
  cami_atendendo boolean not null default false,
  -- Leitura da Cami (só quando chega mensagem nova do cliente).
  combinado text,
  data_combinada timestamptz,
  pendencia text,
  sinal text check (sinal in ('quente', 'neutro', 'esfriando', 'perdendo')),
  cami_lido_id text,
  cami_erro text,
  -- O que a vendedora marcou no painel.
  adiado_ate timestamptz,
  contato_manual_em timestamptz,
  -- Tarefa de follow-up no GHL.
  ghl_task_id text,
  ghl_task_prazo timestamptz,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);

create index if not exists fechamento_cards_ativo_idx on public.fechamento_cards (ativo);

create table if not exists public.fechamento_eventos (
  id bigint generated always as identity primary key,
  opportunity_id text not null,
  contact_id text,
  tipo text not null check (tipo in ('contato', 'adiar', 'perdido', 'fechou', 'modelo')),
  motivo text,
  detalhe jsonb,
  user_id uuid,
  criado_em timestamptz not null default now()
);

create index if not exists fechamento_eventos_opp_idx on public.fechamento_eventos (opportunity_id, criado_em);

alter table public.fechamento_cards enable row level security;
alter table public.fechamento_eventos enable row level security;

drop policy if exists "read authenticated" on public.fechamento_cards;
create policy "read authenticated" on public.fechamento_cards
  for select to authenticated
  using (true);

drop policy if exists approved_user_gate on public.fechamento_cards;
create policy approved_user_gate on public.fechamento_cards
  as restrictive for all to authenticated
  using ((select private.is_approved_user()))
  with check ((select private.is_approved_user()));

drop policy if exists "read authenticated" on public.fechamento_eventos;
create policy "read authenticated" on public.fechamento_eventos
  for select to authenticated
  using (true);

drop policy if exists approved_user_gate on public.fechamento_eventos;
create policy approved_user_gate on public.fechamento_eventos
  as restrictive for all to authenticated
  using ((select private.is_approved_user()))
  with check ((select private.is_approved_user()));

revoke all on table public.fechamento_cards from anon;
revoke all on table public.fechamento_eventos from anon;
