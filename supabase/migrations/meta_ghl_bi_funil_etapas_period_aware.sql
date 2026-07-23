-- ============================================================
-- Ajuste 2026-07-23 (parte 5, aplicado no Dashboard-v2 via MCP)
--
-- "Funil de vendas" e "Custo por etapa do funil" (Visão Geral) viram
-- period-aware (respeitam o seletor 7d/30d/90d/Ano, igual todo o resto do
-- módulo) em vez de all-time fixo (v_funil_etapas/v_custo_por_etapa
-- somavam TODA a base histórica, sem filtro de período nenhum).
--
-- Também, a pedido do usuário:
--   - "Amostra Digital Enviada" vira "Solicitação de Mockup" e usa a mesma
--     lógica legado+webhook do KPI "Mockups"/coluna "Mockups" de
--     get_funnel_por_anuncio (em vez de só snapshot de pipeline).
--   - "Orçamento Gerado" e "Negociação" também passam a somar legado+
--     webhook, pelo mesmo motivo -- pra baterem com as colunas
--     equivalentes de get_funnel_por_anuncio (não fazia sentido esse
--     widget mostrar um "Negociação" diferente do "Negoc." da aba
--     Anúncios).
--   - Etapa "Atendimento" é excluída do funil (é só um balde de "não
--     respondeu", não uma etapa relevante); "Negociação" aparece logo
--     após "Solicitação de Mockup".
--   - Cadastro Inicial e etapas pós-Negociação continuam 100% pipeline
--     (cohort de oportunidades criadas no período) -- ação nossa, sem
--     ganho em usar webhook (mesma régua do fix "Lead volta pro
--     pipeline").
--   - Custo por etapa usa investimento do Meta DENTRO do período
--     selecionado (antes era soma de todo o histórico).
--
-- v_funil_etapas/v_custo_por_etapa NÃO foram removidas (deixadas como
-- estão, sem uso no frontend a partir de agora) -- só a função nova
-- get_funil_etapas(p_inicio, p_fim) é usada por visao-geral.tsx, chamada
-- 2x (período atual + anterior de mesma duração) pra calcular variação %
-- client-side, no mesmo padrão de get_funnel_por_anuncio/anuncios.tsx.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_funil_etapas(p_inicio date, p_fim date)
 RETURNS TABLE(
   pipeline_id text,
   stage_id text,
   stage_name text,
   stage_order int,
   qtd bigint,
   custo_por_oportunidade numeric,
   pct_primeira_etapa numeric,
   pct_etapa_anterior numeric
 )
 LANGUAGE sql
 STABLE
AS $function$
  with marcos as (
    select
      (select stage_order from public.dim_pipeline_stages where stage_name = 'Orçamento Gerado') as ord_orcamento,
      (select stage_order from public.dim_pipeline_stages where stage_name = 'Amostra Digital Enviada') as ord_mockup,
      (select stage_order from public.dim_pipeline_stages where stage_name = 'Negociação') as ord_negociacao
  ),
  alcance as (
    select s.opportunity_id, max(coalesce(d.stage_order, 0)) as max_order
    from public.ghl_stage_snapshots s
    left join public.dim_pipeline_stages d on d.stage_id = s.stage_id
    group by s.opportunity_id
  ),
  opp as (
    select
      o.id, o.created_at,
      greatest(coalesce(a.max_order, 0), coalesce(dcur.stage_order, 0)) as max_order
    from public.ghl_opportunities o
    left join alcance a on a.opportunity_id = o.id
    left join public.dim_pipeline_stages dcur on dcur.stage_id = o.stage_id
    where (o.created_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
  ),
  legado as (
    select
      count(*) filter (where opp.max_order >= m.ord_orcamento) as orcamentos,
      count(*) filter (where opp.max_order >= m.ord_mockup) as mockups,
      count(*) filter (where opp.max_order >= m.ord_negociacao) as negociacoes
    from opp, marcos m
    where (opp.created_at at time zone 'America/Sao_Paulo')::date < date '2026-07-16'
  ),
  webhook as (
    select
      count(*) filter (where e.stage_slug = 'solicitouorcamento') as orcamentos,
      count(*) filter (where e.stage_slug = 'solicitoumockupoficial') as mockups,
      count(*) filter (where e.stage_slug = 'emnegociacao') as negociacoes
    from public.ghl_funnel_events e
    where (e.received_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
      and (e.received_at at time zone 'America/Sao_Paulo')::date >= date '2026-07-16'
  ),
  spend as (
    select coalesce(sum(spend), 0) as total from public.meta_insights_daily where date between p_inicio and p_fim
  ),
  base_pipeline as (
    select
      d.pipeline_id, d.stage_id, d.stage_name, d.stage_order,
      (select count(*) from opp where opp.max_order >= d.stage_order) as qtd
    from public.dim_pipeline_stages d
    where d.is_funil
      and d.stage_name not in ('Orçamento Gerado', 'Amostra Digital Enviada', 'Atendimento', 'Negociação')
  ),
  base_orcamento as (
    select d.pipeline_id, d.stage_id, d.stage_name, d.stage_order,
      (select orcamentos from legado) + (select orcamentos from webhook) as qtd
    from public.dim_pipeline_stages d
    where d.stage_name = 'Orçamento Gerado'
  ),
  base_mockup as (
    select d.pipeline_id, d.stage_id, 'Solicitação de Mockup'::text as stage_name, d.stage_order,
      (select mockups from legado) + (select mockups from webhook) as qtd
    from public.dim_pipeline_stages d
    where d.stage_name = 'Amostra Digital Enviada'
  ),
  base_negociacao as (
    select d.pipeline_id, d.stage_id, d.stage_name, d.stage_order,
      (select negociacoes from legado) + (select negociacoes from webhook) as qtd
    from public.dim_pipeline_stages d
    where d.stage_name = 'Negociação'
  ),
  todas as (
    select * from base_pipeline
    union all select * from base_orcamento
    union all select * from base_mockup
    union all select * from base_negociacao
  )
  select
    t.pipeline_id, t.stage_id, t.stage_name, t.stage_order, t.qtd,
    case when t.qtd > 0 then round((select total from spend) / t.qtd, 2) else null end as custo_por_oportunidade,
    round(100.0 * t.qtd / nullif(first_value(t.qtd) over w, 0), 1) as pct_primeira_etapa,
    round(100.0 * t.qtd / nullif(lag(t.qtd) over w, 0), 1) as pct_etapa_anterior
  from todas t
  window w as (partition by t.pipeline_id order by t.stage_order)
  order by t.pipeline_id, t.stage_order;
$function$;
