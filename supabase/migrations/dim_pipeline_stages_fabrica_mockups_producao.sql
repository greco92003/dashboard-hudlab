-- ============================================================
-- Criado em 2026-08-13
--
-- Achado ao investigar "Vendas (pedidos) x Pagamento Confirmado" não
-- baterem: dim_pipeline_stages só tinha as etapas do pipeline
-- "Atendimento" (xrsxNXLo0SIkWAxiHPf0) cadastradas. Qualquer função
-- que interpreta "quão longe no funil" um negócio está via
-- greatest(max_order dos snapshots, stage_order da etapa ATUAL)
-- (get_funil_etapas, _kpis_periodo, get_funnel_por_anuncio,
-- v_desempenho_uf_mes) tratava a etapa atual como stage_order=0
-- (fallback de coalesce) sempre que o negócio estava numa etapa do
-- pipeline "Fábrica de Mockups" (ShSCF8BTLIdKHAjq491X) -- mesmo já
-- tendo passado de "Pagamento Confirmado" há muito tempo.
--
-- Confirmado via API real do GHL (/opportunities/pipelines): esse
-- pipeline serve dois propósitos diferentes:
--   - 8 primeiras etapas (Criar Mockup, Mockup PRIORIDADE, Alteração,
--     Alteração Prioridade, Logo Inválido, Fazendo Agora, Mockup
--     Pronto, Alteração Pronta) = fila de mockup digital ANTES da
--     venda -- 0 vendas ganhas encontradas nelas, não precisam de
--     stage_order alto (mapeá-las como "depois de Pagamento
--     Confirmado" inflaria negócios ainda não vendidos). Não
--     mapeadas nessa migration -- não afeta métrica atual porque
--     "Solicitação de Mockup" já usa o braço webhook
--     (ghl_funnel_events) pra dado recente, independente dessa tabela.
--   - 2 últimas etapas (Criar Arquivo Serigrafia, Arquivo Serigrafia
--     Pronto) = produção DEPOIS da venda -- confirmado 10 vendas
--     ganhas reais atualmente paradas em "Criar Arquivo Serigrafia"
--     (mesmo nome/propósito da etapa homônima do Atendimento,
--     stage_order=10, is_venda=true). Mapeadas aqui com stage_order
--     alto (>= "Pagamento Confirmado"=9) pra que o fallback
--     greatest() credite corretamente negócios que já venderam mas
--     estão em produção.
-- ============================================================

insert into public.dim_pipeline_stages (pipeline_id, stage_id, stage_name, stage_order, is_funil, is_venda)
values
  ('ShSCF8BTLIdKHAjq491X', '49a81bf5-6148-4074-87d1-bc0aaed13a00', 'Criar Arquivo Serigrafia', 23, false, true),
  ('ShSCF8BTLIdKHAjq491X', '7fb18489-0d66-4591-be25-5146e669b4e8', 'Arquivo Serigrafia Pronto', 24, false, true)
on conflict (stage_id) do nothing;
