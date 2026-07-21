-- ============================================================
-- BI Meta x GHL - v2: pares por pedido, snapshots de funil e
-- ordem canônica das etapas de pipeline
-- (já aplicado no projeto Dashboard-v2 via MCP em 2026-07-21)
-- ============================================================

-- Quantidade de pares do pedido (campo customizado do GHL).
-- A Hud Lab vende em lote: um pedido = dezenas de pares.
alter table public.ghl_opportunities
  add column if not exists qty_pares int;

comment on column public.ghl_opportunities.qty_pares is
  'Pares do pedido (custom field GHL cujo nome contém "pares"/"quantidade"). NULL se não preenchido.';

-- Foto diária do estágio de cada oportunidade. A API do GHL não dá
-- histórico de transições; este snapshot é o que permite o funil
-- etapa a etapa e o custo por etapa.
create table if not exists public.ghl_stage_snapshots (
  snapshot_date  date not null,
  opportunity_id text not null,
  pipeline_id    text,
  stage_id       text,
  stage_name     text,
  status         text,
  monetary_value numeric(12,2),
  primary key (snapshot_date, opportunity_id)
);

comment on table public.ghl_stage_snapshots is
  'Snapshot diário do estágio de cada oportunidade (gravado pelo sync-ghl). Base do funil etapa a etapa.';

-- Ordem canônica das etapas do funil (populada pelo sync-ghl a
-- partir de GET /opportunities/pipelines; stage_order = posição).
create table if not exists public.dim_pipeline_stages (
  pipeline_id   text,
  stage_id      text primary key,
  stage_name    text,
  stage_order   int
);

create index if not exists idx_ghss_opportunity on public.ghl_stage_snapshots (opportunity_id);
create index if not exists idx_ghss_stage on public.ghl_stage_snapshots (stage_id);

alter table public.ghl_stage_snapshots enable row level security;
alter table public.dim_pipeline_stages enable row level security;

drop policy if exists "read authenticated" on public.ghl_stage_snapshots;
create policy "read authenticated" on public.ghl_stage_snapshots
  for select to authenticated using (true);

drop policy if exists "read authenticated" on public.dim_pipeline_stages;
create policy "read authenticated" on public.dim_pipeline_stages
  for select to authenticated using (true);
