-- ============================================================
-- Venda por ETAPA (já aplicado no Dashboard-v2 via MCP em 2026-07-21)
--
-- Na Hud Lab ninguém marca status "won" no GHL — o card avança de
-- etapa. Venda = oportunidade em etapa com is_venda = true (a partir
-- de "Pagamento Confirmado" no pipeline Atendimento) OU status won.
-- A flag é configurável em dim_pipeline_stages.is_venda; etapas
-- novas nascem false.
--
-- Esta migration também:
-- - adiciona ghl_opportunities.stage_changed_at (lastStageChangeAt)
-- - cria a view v_vendas (fonte única da definição de venda)
-- - refaz v_funnel_por_anuncio, v_desempenho_uf_mes,
--   v_leads_sem_venda, v_desempenho_fonte, v_funil_etapas e
--   _kpis_periodo para usarem v_vendas
--
-- Conteúdo completo aplicado no banco: ver migration
-- "meta_ghl_bi_venda_por_etapa" no histórico do Supabase.
-- ============================================================

alter table public.dim_pipeline_stages
  add column if not exists is_venda boolean not null default false;

alter table public.ghl_opportunities
  add column if not exists stage_changed_at timestamptz;
