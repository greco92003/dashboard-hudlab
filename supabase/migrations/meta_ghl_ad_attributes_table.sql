-- ============================================================
-- Criado em 2026-07-31 (aplicado no Dashboard-v2 via MCP)
--
-- Dimensão de atributos do anúncio no Meta (status atual, objetivo da
-- campanha, meta de otimização e destino do conjunto de anúncios).
-- Diferente de meta_insights_daily (série temporal), essa tabela é um
-- snapshot do estado ATUAL de cada ad_id -- sincronizada junto do
-- sync-meta, upsert por ad_id (sem histórico).
--
-- Motivação: o Insights (meta-ghl-ad-insights) só olhava spend/leads/
-- funil dos últimos 30 dias e não sabia se o anúncio já tinha sido
-- pausado no Meta, nem se o objetivo era geração de lead ou tráfego
-- pro perfil (BIO) -- gerando sugestões de "PAUSAR" redundantes e
-- avaliações injustas de anúncios de topo de funil. Ver
-- adset_destination_type = 'INSTAGRAM_PROFILE' pra identificar esses.
-- ============================================================

create table public.meta_ad_attributes (
  ad_id text primary key,
  effective_status text,
  campaign_objective text,
  adset_optimization_goal text,
  adset_destination_type text,
  synced_at timestamptz not null default now()
);

alter table public.meta_ad_attributes enable row level security;

create policy "approved_user_gate" on public.meta_ad_attributes
  for all
  using (private.is_approved_user());

create policy "read authenticated" on public.meta_ad_attributes
  for select
  to authenticated
  using (true);
