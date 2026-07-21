-- ============================================================
-- Ajustes definidos pelo usuário em 2026-07-21
-- (já aplicado no projeto Dashboard-v2 via MCP)
--
-- 1) Removida oportunidade de teste (Rodrigo Dias / ad_id
--    "ChinelosLindos", id 5NxRNIoZI9NQpMflY3r7) — estava parada em
--    "Impressão de Fotolitos" com valor R$0, sem ser um negócio real.
--    Excluída permanentemente também no sync-ghl
--    (EXCLUDED_OPPORTUNITY_IDS em supabase/functions/sync-ghl/index.ts).
--
-- 2) Etapas "Conferir Pgto/Completar Dados" e "Amostra Alterada
--    Enviada" não são usadas no processo real e saem do funil
--    analítico (is_funil=false) — a segunda removida em seguida, no
--    mesmo dia, a pedido do usuário.
--
-- 3) VENDA agora exige status = 'won' explicitamente (mudança de
--    comportamento: antes, apenas chegar na etapa "Pagamento
--    Confirmado" já contava como venda). v_vendas simplificada para
--    `where status = 'won'`; v_funnel_por_anuncio ajustada para
--    contar vendas/faturamento/pares_vendidos só quando status='won'
--    (os marcos anteriores — orçamento/mockup/negociação — continuam
--    baseados em etapa alcançada, não mudou).
--
-- Conteúdo completo das views: ver migration
-- "meta_ghl_bi_ajustes_venda_won" no histórico do Supabase.
--
-- 4) (mesmo dia, correção seguinte) O diagnóstico "LEAD BARATO VENDA
--    CARA" julgava conversão usando TODOS os leads, inclusive os
--    recém-criados — com lead time de 35 dias e só ~21 dias de
--    coleta, nenhum lead teve tempo real de converter, gerando
--    alarme falso (GrecoClassico e GHL - Estático Jornal de
--    Negócios). Corrigido em "meta_ghl_bi_diagnostico_lead_maduro":
--    o diagnóstico agora só usa leads_maduros/vendas_maduras
--    (oportunidade criada há mais de 35 dias); taxa_conversao_lead_venda
--    exibida na tabela continua sendo a geral (informativa).
-- ============================================================

update public.dim_pipeline_stages
set is_funil = false
where stage_name in ('Conferir Pgto/Completar Dados', 'Amostra Alterada Enviada');
