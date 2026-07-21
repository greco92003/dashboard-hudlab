-- ============================================================
-- Escopo do BI (aplicado no Dashboard-v2 via MCP em 2026-07-21)
--
-- Regras definidas pelo usuário:
-- - Apenas pipeline "Atendimento" (Fábrica de Mockups é passagem
--   dos mesmos clientes)
-- - Apenas oportunidades criadas a partir de 01/07/2026 (campos
--   melhor preenchidos a partir dessa data)
-- - Apenas contatos vinculados a oportunidades (o resto era
--   importação de CRM antigo — foram deletados)
-- - Funil analítico: Cadastro Inicial até Pagamento Confirmado
--   (is_funil); venda = atingiu Pagamento Confirmado (is_venda)
-- - O sync-ghl aplica o mesmo filtro (TARGET_PIPELINE_NAME e
--   MIN_OPP_CREATED_MS em supabase/functions/sync-ghl/index.ts)
-- ============================================================

alter table public.dim_pipeline_stages
  add column if not exists is_funil boolean not null default false;

-- Limpeza (executada uma vez; o sync não reintroduz fora do escopo):
-- delete de snapshots/oportunidades fora do pipeline Atendimento ou
-- criadas antes de 01/07/2026; delete de contatos sem oportunidade;
-- delete das etapas do pipeline Fábrica de Mockups.

update public.dim_pipeline_stages set
  is_funil = stage_order <= (select stage_order from public.dim_pipeline_stages
                             where stage_name = 'Pagamento Confirmado'),
  is_venda = stage_order >= (select stage_order from public.dim_pipeline_stages
                             where stage_name = 'Pagamento Confirmado');
