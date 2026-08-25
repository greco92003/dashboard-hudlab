-- Chão de fábrica: a produção dá o pedido como concluído pelo dashboard e ele
-- avança para a etapa "Expedição" no GHL. É o único movimento que o dashboard
-- faz no CRM.

-- ── Papel ───────────────────────────────────────────────────────────────────
alter table public.user_profiles drop constraint if exists user_profiles_role_check;
alter table public.user_profiles add constraint user_profiles_role_check
  check (role = any (array[
    'owner','admin','manager','team-leader','partners-media','user','producao'
  ]));

-- ── PIN ─────────────────────────────────────────────────────────────────────
-- O login diz quem é; o PIN, pedido só na hora de concluir, diz que foi a
-- pessoa mesma e agora. Guardado com scrypt + salt, nunca em texto puro.
create table if not exists public.producao_pins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pin_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS ligada e SEM policy permissiva: nenhum cliente lê ou escreve esta tabela.
-- Criação e conferência do PIN passam pelo servidor, com a chave de serviço.
alter table public.producao_pins enable row level security;

comment on table public.producao_pins is
  'PIN de 4 dígitos da produção (scrypt+salt). Só o servidor acessa.';

-- ── Registro de quem concluiu ───────────────────────────────────────────────
create table if not exists public.producao_conclusoes (
  id uuid primary key default gen_random_uuid(),
  deal_id text not null,
  deal_title text,
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  pipeline_id text,
  from_stage text not null,
  to_stage text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_producao_conclusoes_deal
  on public.producao_conclusoes (deal_id, created_at desc);
create index if not exists idx_producao_conclusoes_data
  on public.producao_conclusoes (created_at desc);

alter table public.producao_conclusoes enable row level security;

-- Só escrita pelo servidor; leitura liberada para quem já está aprovado, para
-- o escritório conseguir reconstruir quem deu o pedido como pronto.
drop policy if exists producao_conclusoes_leitura on public.producao_conclusoes;
create policy producao_conclusoes_leitura on public.producao_conclusoes
  for select to authenticated
  using (exists (
    select 1 from public.user_profiles p
    where p.id = auth.uid() and p.approved is true
  ));

comment on table public.producao_conclusoes is
  'Quem deu cada pedido como concluído na /producao, e de qual etapa para qual.';
