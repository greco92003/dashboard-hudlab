-- ============================================================
-- Criado em 2026-08-10 (aplicado no Dashboard-v2 via MCP)
--
-- v_vendas nunca excluía v_contatos_importados -- diferente de
-- get_funnel_por_anuncio (imune por acidente: seu JOIN interno com
-- ghl_contacts já exige contato sincronizado, e os importados/órfãos
-- nunca têm), _kpis_periodo, v_desempenho_fonte, v_desempenho_uf_mes e
-- v_leads_sem_venda dependem de v_vendas SEM nenhuma exclusão.
--
-- Com a migração v_contatos_importados_inclui_orfaos_sem_tag (que
-- passou a cobrir o lote de 12.082 oportunidades importadas em
-- 03/08/2026 sem tag), corrigir na origem (v_vendas) propaga o fix
-- pra TODOS os consumidores de uma vez, em vez de remendar cada
-- função separadamente -- e cobre qualquer consumidor futuro
-- automaticamente.
--
-- Impacto medido antes do fix: _kpis_periodo(hoje-30, hoje) mostrava
-- Faturamento R$1.713.426,04 e ROAS 121,57x (lote de importação
-- inteiro contado como venda do período).
-- ============================================================

create or replace view public.v_vendas
with (security_invoker = true) as
select
  o.id,
  o.contact_id,
  o.pipeline_id,
  o.pipeline_name,
  o.stage_id,
  o.stage_name,
  o.monetary_value,
  coalesce(o.qty_pares, c.qty_pares) as qty_pares,
  coalesce(o.won_at, o.updated_at) as venda_em
from ghl_opportunities o
left join ghl_contacts c on c.id = o.contact_id
where o.status = 'won'
  and o.contact_id not in (select contact_id from public.v_contatos_importados);
