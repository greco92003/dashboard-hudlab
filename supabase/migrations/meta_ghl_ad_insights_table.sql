-- ============================================================
-- Criado em 2026-07-31 (aplicado no Dashboard-v2 via MCP)
--
-- Tabela pra recomendação diária gerada por IA (Claude), por anúncio --
-- complementa o badge "Diagnóstico" (GERA VENDA/LEAD BARATO VENDA CARA/
-- REVISAR) já calculado em get_funnel_por_anuncio com um veredito mais
-- rico (ESCALAR/MANTER/REVISAR/PAUSAR) e uma justificativa escrita.
-- Upsert por ad_id -- sempre mostra a análise mais recente, sem
-- histórico acumulado (não precisamos comparar recomendações antigas).
--
-- Gerada pela edge function supabase/functions/meta-ghl-insights/index.ts,
-- via cron diário (ver migration meta_ghl_insights_cron.sql).
-- ============================================================

create table public.meta_ghl_ad_insights (
  ad_id text primary key,
  ad_name text,
  campaign_name text,
  veredito text not null check (veredito in ('ESCALAR', 'MANTER', 'REVISAR', 'PAUSAR')),
  justificativa text not null,
  periodo_inicio date not null,
  periodo_fim date not null,
  gerado_por text not null,
  gerado_em timestamptz not null default now()
);

alter table public.meta_ghl_ad_insights enable row level security;

-- Mesmo padrão das demais tabelas do módulo (ghl_opportunities etc.):
-- approved_user_gate + uma política extra de leitura livre pra
-- authenticated, senão o client-side (RPC/.from()) fica sem ver nada
-- mesmo com o gate passando -- já caímos nessa armadilha uma vez com
-- ghl_funnel_events (ver migration ghl_funnel_events_rls_read_authenticated).
create policy "approved_user_gate" on public.meta_ghl_ad_insights
  for all
  using (private.is_approved_user());

create policy "read authenticated" on public.meta_ghl_ad_insights
  for select
  to authenticated
  using (true);
