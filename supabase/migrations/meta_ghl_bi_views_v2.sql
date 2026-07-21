-- ============================================================
-- BI Meta x GHL - Views v2: desempenho por fonte, funil etapa a
-- etapa (via snapshots), custo por etapa, UTMs sem match e
-- get_resumo_periodo com período anterior + variação %.
-- (já aplicado no projeto Dashboard-v2 via MCP em 2026-07-21)
--
-- NOTA DE UNIDADES: a Hud Lab vende em lote (1 pedido ≈ dezenas de
-- pares). CPA/CAC é sempre POR PEDIDO; custo_por_par é métrica
-- separada. Nunca misturar as duas na mesma comparação.
-- ============================================================

-- ------------------------------------------------------------
-- v_desempenho_fonte: performance agnóstica de canal.
-- fonte derivada de utm_source/source. Investimento hoje só existe
-- para 'Meta Ads' (soma de meta_insights_daily); para as demais é
-- NULL (o front exibe "N/D"). Para integrar Google Ads no futuro:
-- adicionar a tabela de spend e um UNION em spend_por_fonte.
-- ------------------------------------------------------------
create or replace view public.v_desempenho_fonte
with (security_invoker = true) as
with contatos as (
  select
    c.id,
    case
      when lower(coalesce(nullif(c.utm_source, ''), nullif(c.source, ''), ''))
           ~ '(facebook|instagram|meta|^fb$)' then 'Meta Ads'
      when lower(coalesce(nullif(c.utm_source, ''), nullif(c.source, ''), ''))
           ~ 'google' then 'Google Ads'
      when lower(coalesce(nullif(c.utm_source, ''), nullif(c.source, ''), ''))
           ~ '(indica|referral)' then 'Indicação'
      when coalesce(nullif(c.utm_source, ''), nullif(c.source, '')) is null then 'Orgânico'
      else 'Outros'
    end as fonte
  from public.ghl_contacts c
),
agg as (
  select
    ct.fonte,
    count(*) as leads,
    count(distinct o.contact_id) filter (where o.status = 'won') as vendas,
    coalesce(sum(o.monetary_value) filter (where o.status = 'won'), 0) as faturamento
  from contatos ct
  left join public.ghl_opportunities o on o.contact_id = ct.id
  group by ct.fonte
),
-- Uma linha por fonte com investimento conhecido. Integrações
-- futuras entram aqui como UNION ALL sem mexer no resto da view.
spend_por_fonte as (
  select 'Meta Ads'::text as fonte, sum(spend) as investimento
  from public.meta_insights_daily
)
select
  a.fonte,
  s.investimento,
  a.leads,
  case when s.investimento is not null and a.leads > 0
       then round(s.investimento / a.leads, 2) end as cpl,
  a.vendas,
  a.faturamento,
  case when s.investimento is not null and s.investimento > 0
       then round(a.faturamento / s.investimento, 2) end as roas
from agg a
left join spend_por_fonte s on s.fonte = a.fonte
order by a.faturamento desc;

-- ------------------------------------------------------------
-- v_funil_etapas: quantas oportunidades ATINGIRAM cada etapa.
-- Uma oportunidade atinge a etapa N se algum snapshot dela esteve
-- na etapa N ou em etapa de stage_order superior, ou se status=won
-- (won conta como ter atingido todas as etapas do pipeline).
-- Só existe a partir da data em que o sync-ghl começou a gravar
-- snapshots (a API do GHL não dá histórico de transições).
-- ------------------------------------------------------------
create or replace view public.v_funil_etapas
with (security_invoker = true) as
with alcance as (
  -- etapa máxima que cada oportunidade atingiu (999999 = won)
  select
    s.opportunity_id,
    s.pipeline_id,
    max(case when s.status = 'won' then 999999 else coalesce(d.stage_order, 0) end) as max_order
  from public.ghl_stage_snapshots s
  left join public.dim_pipeline_stages d on d.stage_id = s.stage_id
  group by s.opportunity_id, s.pipeline_id
),
por_etapa as (
  select
    d.pipeline_id,
    d.stage_id,
    d.stage_name,
    d.stage_order,
    count(a.opportunity_id) filter (where a.max_order >= d.stage_order) as qtd
  from public.dim_pipeline_stages d
  left join alcance a on a.pipeline_id = d.pipeline_id
  group by d.pipeline_id, d.stage_id, d.stage_name, d.stage_order
)
select
  pipeline_id,
  stage_id,
  stage_name,
  stage_order,
  qtd,
  round(100.0 * qtd / nullif(first_value(qtd) over w, 0), 1) as pct_primeira_etapa,
  round(100.0 * qtd / nullif(lag(qtd) over w, 0), 1) as pct_etapa_anterior
from por_etapa
window w as (partition by pipeline_id order by stage_order)
order by pipeline_id, stage_order;

-- ------------------------------------------------------------
-- v_custo_por_etapa: custo médio para levar uma oportunidade até
-- cada etapa = spend total do Meta / oportunidades que atingiram a
-- etapa. Usa o acumulado desde o início da coleta (views não
-- recebem parâmetro de período).
-- ------------------------------------------------------------
create or replace view public.v_custo_por_etapa
with (security_invoker = true) as
with spend_total as (
  select coalesce(sum(spend), 0) as total from public.meta_insights_daily
)
select
  f.pipeline_id,
  f.stage_id,
  f.stage_name,
  f.stage_order,
  f.qtd,
  case when f.qtd > 0 then round((select total from spend_total) / f.qtd, 2) end as custo_por_oportunidade
from public.v_funil_etapas f
order by f.pipeline_id, f.stage_order;

-- ------------------------------------------------------------
-- v_utm_sem_match: utm_content sem correspondência com ad_id do
-- Meta — para investigar campanhas com UTM quebrada.
-- ------------------------------------------------------------
create or replace view public.v_utm_sem_match
with (security_invoker = true) as
select
  c.utm_content,
  max(c.utm_campaign) as utm_campaign,
  max(c.utm_source) as utm_source,
  count(*) as qtd_contatos,
  max(c.created_at) as ultimo_contato
from public.ghl_contacts c
where c.utm_content is not null and c.utm_content <> ''
  and not exists (
    select 1 from public.meta_insights_daily m where m.ad_id = c.utm_content
  )
group by c.utm_content
order by qtd_contatos desc;

-- ------------------------------------------------------------
-- get_resumo_periodo v2: KPIs do período + período imediatamente
-- anterior de mesma duração + variação %.
-- Formato: {"atual": {...}, "anterior": {...}, "variacao_pct": {...}}
-- KPIs: spend, impressoes, cliques, leads, vendas, faturamento,
-- roas, cpa_pedido, pares_vendidos, ticket_medio_par, custo_por_par.
-- Métricas de pares retornam NULL (não zero) quando nenhuma venda
-- do período tem qty_pares preenchido.
-- ------------------------------------------------------------
create or replace function public._kpis_periodo(p_inicio date, p_fim date)
returns jsonb
language plpgsql
stable
security invoker
as $$
declare
  v_spend numeric;
  v_impressoes bigint;
  v_cliques bigint;
  v_leads bigint;
  v_vendas bigint;
  v_faturamento numeric;
  v_pares bigint;
begin
  select coalesce(sum(spend), 0), coalesce(sum(impressions), 0), coalesce(sum(clicks), 0)
    into v_spend, v_impressoes, v_cliques
  from public.meta_insights_daily
  where date between p_inicio and p_fim;

  select count(*) into v_leads
  from public.ghl_contacts
  where (created_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim;

  select count(distinct o.contact_id),
         coalesce(sum(o.monetary_value), 0),
         sum(o.qty_pares)                      -- NULL se todas as won forem NULL
    into v_vendas, v_faturamento, v_pares
  from public.ghl_opportunities o
  where o.status = 'won'
    and (coalesce(o.won_at, o.updated_at) at time zone 'America/Sao_Paulo')::date
        between p_inicio and p_fim;

  return jsonb_build_object(
    'spend', v_spend,
    'impressoes', v_impressoes,
    'cliques', v_cliques,
    'leads', v_leads,
    'vendas', v_vendas,
    'faturamento', v_faturamento,
    'roas', case when v_spend > 0 then round(v_faturamento / v_spend, 2) end,
    'cpa_pedido', case when v_vendas > 0 then round(v_spend / v_vendas, 2) end,
    'cpl', case when v_leads > 0 then round(v_spend / v_leads, 2) end,
    'ctr', case when v_impressoes > 0 then round(100.0 * v_cliques / v_impressoes, 2) end,
    'cpc', case when v_cliques > 0 then round(v_spend / v_cliques, 2) end,
    'pares_vendidos', v_pares,
    'ticket_medio_par', case when v_pares > 0 then round(v_faturamento / v_pares, 2) end,
    'custo_por_par', case when v_pares > 0 then round(v_spend / v_pares, 2) end
  );
end;
$$;

create or replace function public.get_resumo_periodo(p_inicio date, p_fim date)
returns jsonb
language plpgsql
stable
security invoker
as $$
declare
  v_dias int;
  v_atual jsonb;
  v_anterior jsonb;
  v_var jsonb := '{}'::jsonb;
  k text;
  a numeric;
  b numeric;
begin
  v_dias := p_fim - p_inicio;
  v_atual := public._kpis_periodo(p_inicio, p_fim);
  v_anterior := public._kpis_periodo(p_inicio - v_dias - 1, p_inicio - 1);

  for k in select jsonb_object_keys(v_atual) loop
    if jsonb_typeof(v_atual -> k) = 'number' and jsonb_typeof(v_anterior -> k) = 'number' then
      a := (v_atual ->> k)::numeric;
      b := (v_anterior ->> k)::numeric;
      if b <> 0 then
        v_var := v_var || jsonb_build_object(k, round(100.0 * (a - b) / b, 1));
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'atual', v_atual,
    'anterior', v_anterior,
    'variacao_pct', v_var
  );
end;
$$;

comment on function public.get_resumo_periodo(date, date) is
  'KPIs do período + período anterior de mesma duração + variação % — formato {atual, anterior, variacao_pct}.';
