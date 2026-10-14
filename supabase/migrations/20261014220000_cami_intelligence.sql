-- ============================================================
-- CAMI Intelligence (spec 2026-10-14-cami-intelligence-design, PR 2).
--
-- ai_seller_conversations: uma linha por oportunidade assumida pela Cami,
--   recalculada pelo cron refresh-cami (etapa, situação, sinais). A página
--   lê daqui sem consultar o GHL. reviewed_* é do owner ("Revisado") e o
--   cron nunca escreve nessas colunas.
-- ai_seller_baseline: referência "antes da Cami", calculada uma vez.
-- ai_seller_settings.custo: preço do modelo e dólar para estimar o custo.
-- ============================================================

create table if not exists public.ai_seller_conversations (
  opportunity_id text primary key,
  contact_id text not null,
  contact_name text,
  pares integer,
  assigned_at timestamptz not null,
  pipeline_name text,
  stage_name text,
  opp_status text,
  monetary_value numeric,
  situacao text not null,
  reached_negociacao boolean not null default false,
  reached_prioridade boolean not null default false,
  client_replied boolean not null default false,
  handoff_motivo text,
  handoff_at timestamptz,
  handoff_answered_at timestamptz,
  last_client_at timestamptz,
  last_cami_at timestamptz,
  replies integer not null default 0,
  tokens_in bigint not null default 0,
  tokens_out bigint not null default 0,
  max_response_ms integer,
  signals text[] not null default '{}',
  reviewed_signals text[] not null default '{}',
  reviewed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists ai_seller_conversations_assigned_idx
  on public.ai_seller_conversations (assigned_at desc);

create table if not exists public.ai_seller_baseline (
  id smallint primary key default 1 check (id = 1),
  periodo_inicio date not null,
  periodo_fim date not null,
  amostras integer not null,
  pct_negociacao numeric,
  pct_ganho_30d numeric,
  mediana_primeira_resposta_min numeric,
  n_resposta integer,
  calculado_em timestamptz not null default now()
);

alter table public.ai_seller_settings
  add column if not exists custo jsonb not null
    default '{"entradaUsdPorMilhao":2.5,"saidaUsdPorMilhao":15,"dolar":5.4}'::jsonb;

do $$
declare t text;
begin
  foreach t in array array['ai_seller_conversations', 'ai_seller_baseline'] loop
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
