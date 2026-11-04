-- ============================================================
-- Importado que volta como lead novo conta a partir da volta (2026-11-04)
--
-- O Meta Marketing excluía para sempre todo contato da importação do CRM
-- antigo (03/08). A exclusão existe para tirar os artefatos da migração
-- (negócios ganhos carimbados em 03/08, tags em massa), mas também tirava o
-- cliente antigo que volta de verdade: de agosto a outubro, 60 a 75 por mês
-- voltaram como lead (a maioria por anúncio da Meta) e uns 25 por mês pediram
-- mockup sem aparecer no Meta Marketing (o /funil contava). Em 03/11: 24
-- mockups no /funil, 21 no Meta Marketing, a diferença eram 3 desses.
--
-- v_importados_corte: para cada importado, o corte é 1 dia antes do primeiro
-- webhook de lead depois da importação (a oportunidade nova é criada segundos
-- antes do webhook); quem nunca voltou tem corte infinito. Os filtros passam a
-- excluir só o que é anterior ao corte: oportunidade pela criação, evento pelo
-- recebimento. A atribuição por contato (v_contato_atribuicao, v_utm_sem_match)
-- trata como importado só quem nunca voltou.
--
-- get_conversao_criativos não muda: o recorte dela é pela criação do contato,
-- e o importado foi criado na importação.
-- Definições abaixo geradas a partir das de produção em 04/11, trocando só o
-- filtro de importados.
-- ============================================================

CREATE OR REPLACE VIEW public.v_importados_corte
WITH (security_invoker = true) AS
WITH retorno AS (
  SELECT l.contact_id, min(l.received_at) AS voltou_em, max(c.created_at) AS criado_em
  FROM public.ghl_funnel_events l
    JOIN public.mv_contatos_importados i ON i.contact_id = l.contact_id
    JOIN public.ghl_contacts c ON c.id = l.contact_id
  WHERE l.stage_slug = 'lead'
    AND l.received_at >= greatest(c.created_at + interval '1 day', timestamptz '2026-08-04 03:00+00')
  GROUP BY l.contact_id
)
SELECT i.contact_id,
  -- Nunca antes de 1 dia depois da importação do contato: quem voltou em 04/08
  -- não pode trazer de volta oportunidade criada pela própria importação.
  COALESCE(greatest(r.voltou_em - interval '1 day', r.criado_em + interval '1 day'), 'infinity'::timestamptz) AS corte
FROM public.mv_contatos_importados i
  LEFT JOIN retorno r ON r.contact_id = i.contact_id;

GRANT SELECT ON public.v_importados_corte TO authenticated;
GRANT SELECT ON public.v_importados_corte TO service_role;

-- _kpis_periodo
CREATE OR REPLACE FUNCTION public._kpis_periodo(p_inicio date, p_fim date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ini date := greatest(p_inicio, public.meta_inicio_coleta());
  v_spend numeric;
  v_impressoes bigint;
  v_cliques bigint;
  v_leads bigint;
  v_vendas bigint;
  v_faturamento numeric;
  v_faturamento_com_pares numeric;
  v_vendas_sem_pares bigint;
  v_pares bigint;
  v_faturamento_meta numeric;
  v_vendas_meta bigint;
  v_mockups bigint;
  v_mockups_legado bigint;
  v_mockups_webhook bigint;
  v_ord_mockup int;
begin
  select coalesce(sum(spend), 0), coalesce(sum(impressions), 0), coalesce(sum(clicks), 0)
    into v_spend, v_impressoes, v_cliques
  from public.meta_insights_daily
  where date between v_ini and p_fim;

  select stage_order into v_ord_mockup
  from public.dim_pipeline_stages where stage_name = 'Amostra Digital Enviada';

  -- Lead = oportunidade criada no período, fora da base importada.
  select count(*) into v_leads
  from public.ghl_opportunities o
  where (o.created_at at time zone 'America/Sao_Paulo')::date between v_ini and p_fim
    and not exists (select 1 from public.v_importados_corte i_ where i_.contact_id = o.contact_id and o.created_at < i_.corte);

  select count(*) into v_mockups_legado
  from public.ghl_opportunities o
  where (o.created_at at time zone 'America/Sao_Paulo')::date between v_ini and p_fim
    and (o.created_at at time zone 'America/Sao_Paulo')::date < date '2026-07-16'
    and not exists (select 1 from public.v_importados_corte i_ where i_.contact_id = o.contact_id and o.created_at < i_.corte)
    and greatest(
          coalesce((select max(coalesce(d.stage_order, 0))
                    from public.ghl_stage_snapshots s
                    left join public.dim_pipeline_stages d on d.stage_id = s.stage_id
                    where s.opportunity_id = o.id), 0),
          coalesce((select stage_order from public.dim_pipeline_stages where stage_id = o.stage_id), 0)
        ) >= v_ord_mockup;

  select count(*) filter (where e.stage_slug = 'solicitoumockupoficial')
    into v_mockups_webhook
  from public.ghl_funnel_events e
  where (e.received_at at time zone 'America/Sao_Paulo')::date between v_ini and p_fim
    and (e.received_at at time zone 'America/Sao_Paulo')::date >= date '2026-07-16'
    and not exists (select 1 from public.v_importados_corte i_ where i_.contact_id = e.contact_id and e.received_at < i_.corte);

  v_mockups := coalesce(v_mockups_legado, 0) + coalesce(v_mockups_webhook, 0);

  select
    count(*) filter (where p.monetary_value > 0),
    coalesce(sum(p.monetary_value), 0),
    sum(p.qty_pares),
    coalesce(sum(p.monetary_value) filter (where p.qty_pares is not null), 0),
    count(*) filter (where p.qty_pares is null and p.monetary_value > 0),
    coalesce(sum(p.monetary_value) filter (where p.chave_meta is not null), 0),
    count(*) filter (where p.chave_meta is not null and p.monetary_value > 0)
    into v_vendas, v_faturamento, v_pares, v_faturamento_com_pares, v_vendas_sem_pares,
         v_faturamento_meta, v_vendas_meta
  from public.v_pedidos_ganhos p
  where p.dia_venda between v_ini and p_fim;

  return jsonb_build_object(
    'spend', v_spend,
    'impressoes', v_impressoes,
    'cliques', v_cliques,
    'leads', v_leads,
    'vendas', v_vendas,
    'faturamento', v_faturamento,
    'roas', case when v_spend > 0 then round(v_faturamento / v_spend, 2) end,
    'faturamento_meta', v_faturamento_meta,
    'vendas_meta', v_vendas_meta,
    'roas_meta', case when v_spend > 0 then round(v_faturamento_meta / v_spend, 2) end,
    'cpa_pedido', case when v_vendas > 0 then round(v_spend / v_vendas, 2) end,
    'cpl', case when v_leads > 0 then round(v_spend / v_leads, 2) end,
    'ctr', case when v_impressoes > 0 then round(100.0 * v_cliques / v_impressoes, 2) end,
    'cpc', case when v_cliques > 0 then round(v_spend / v_cliques, 2) end,
    'pares_vendidos', v_pares,
    'ticket_medio_par', case when v_pares > 0 then round(v_faturamento_com_pares / v_pares, 2) end,
    'custo_por_par', case when v_pares > 0 then round(v_spend / v_pares, 2) end,
    'vendas_sem_pares', v_vendas_sem_pares,
    'mockups', v_mockups,
    'custo_por_mockup', case when v_mockups > 0 then round(v_spend / v_mockups, 2) end
  );
end;
$function$;

-- get_funil_etapas
CREATE OR REPLACE FUNCTION public.get_funil_etapas(p_inicio date, p_fim date)
 RETURNS TABLE(pipeline_id text, stage_id text, stage_name text, stage_order integer, qtd bigint, custo_por_oportunidade numeric, pct_primeira_etapa numeric, pct_etapa_anterior numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with marcos as (
    select
      (select stage_order from public.dim_pipeline_stages where stage_name = 'Orçamento Gerado') as ord_orcamento,
      (select stage_order from public.dim_pipeline_stages where stage_name = 'Amostra Digital Enviada') as ord_mockup,
      (select stage_order from public.dim_pipeline_stages where stage_name = 'Negociação') as ord_negociacao
  ),
  coorte as (
    select o.id, o.created_at, o.stage_id
    from public.ghl_opportunities o
    where (o.created_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
      and not exists (select 1 from public.v_importados_corte i_ where i_.contact_id = o.contact_id and o.created_at < i_.corte)
  ),
  alcance as (
    select s.opportunity_id, max(coalesce(d.stage_order, 0)) as max_order
    from coorte c
    join public.ghl_stage_snapshots s on s.opportunity_id = c.id
    left join public.dim_pipeline_stages d on d.stage_id = s.stage_id
    group by s.opportunity_id
  ),
  opp as (
    select
      c.id, c.created_at,
      greatest(coalesce(a.max_order, 0), coalesce(dcur.stage_order, 0)) as max_order
    from coorte c
    left join alcance a on a.opportunity_id = c.id
    left join public.dim_pipeline_stages dcur on dcur.stage_id = c.stage_id
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
      and not exists (select 1 from public.v_importados_corte i_ where i_.contact_id = e.contact_id and e.received_at < i_.corte)
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

-- get_funnel_por_anuncio
CREATE OR REPLACE FUNCTION public.get_funnel_por_anuncio(p_inicio date, p_fim date)
 RETURNS TABLE(ad_id text, ad_name text, campaign_id text, campaign_name text, adset_id text, adset_name text, spend_total numeric, impressoes bigint, cliques bigint, leads_meta numeric, cpl_meta numeric, leads_ghl bigint, orcamentos bigint, valor_orcamentos numeric, pares_orcamentos bigint, mockups bigint, negociacoes bigint, vendas bigint, faturamento numeric, pares_vendidos bigint, custo_por_lead numeric, custo_por_orcamento numeric, custo_por_mockup numeric, custo_por_negociacao numeric, cpa_venda numeric, taxa_conversao_lead_venda numeric, roas numeric, diagnostico text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with janela as (
    select greatest(p_inicio, public.meta_inicio_coleta()) as ini, p_fim as fim
  ),
  marcos as (
    select
      (select stage_order from public.dim_pipeline_stages where stage_name = 'Orçamento Gerado') as ord_orcamento,
      (select stage_order from public.dim_pipeline_stages where stage_name = 'Amostra Digital Enviada') as ord_mockup,
      (select stage_order from public.dim_pipeline_stages where stage_name = 'Negociação') as ord_negociacao
  ),
  alcance as (
    select s.opportunity_id, max(coalesce(d.stage_order, 0)) as max_order
    from public.ghl_stage_snapshots s
    left join public.dim_pipeline_stages d on d.stage_id = s.stage_id
    where s.opportunity_id in (
      select o.id
      from public.ghl_opportunities o
      cross join janela j
      where (o.created_at at time zone 'America/Sao_Paulo')::date between j.ini and j.fim
        and (o.created_at at time zone 'America/Sao_Paulo')::date < date '2026-07-16'
    )
    group by s.opportunity_id
  ),
  atrib as (
    select contact_id, chave_meta from public.mv_contato_atribuicao where chave_meta is not null
  ),
  -- Coorte: leads CRIADOS na janela (leads, marcos do braço legado e maturidade).
  opp as (
    select
      o.id, o.contact_id, a.chave_meta as ad_id, o.status, o.created_at,
      o.monetary_value as valor_bruto,
      -- o filtro de pares plausíveis protege o valor de ORÇAMENTO (cliente
      -- digita CEP no lugar da quantidade); venda ganha não passa por ele.
      case when public.dado_par_plausivel(coalesce(o.qty_pares, c.qty_pares), o.monetary_value)
           then o.monetary_value end as valor_orcamento,
      case when public.dado_par_plausivel(coalesce(o.qty_pares, c.qty_pares), o.monetary_value)
           then coalesce(o.qty_pares, c.qty_pares) end as pares_orcamento,
      greatest(coalesce(al.max_order, 0), coalesce(dcur.stage_order, 0)) as max_order
    from public.ghl_opportunities o
    join public.ghl_contacts c on c.id = o.contact_id
    join atrib a on a.contact_id = o.contact_id
    left join alcance al on al.opportunity_id = o.id
    left join public.dim_pipeline_stages dcur on dcur.stage_id = o.stage_id
    cross join janela j
    where (o.created_at at time zone 'America/Sao_Paulo')::date between j.ini and j.fim
      and not exists (select 1 from public.v_importados_corte i_ where i_.contact_id = o.contact_id and o.created_at < i_.corte)
  ),
  pipeline_agg as (
    select
      opp.ad_id,
      count(distinct opp.contact_id) as leads_total,
      count(*) filter (where opp.created_at < now() - interval '35 days') as leads_maduros,
      count(*) filter (where opp.created_at < now() - interval '35 days' and opp.status = 'won' and opp.valor_bruto > 0) as vendas_maduras
    from opp
    group by opp.ad_id
  ),
  legado_agg as (
    select
      opp.ad_id,
      count(*) filter (where opp.max_order >= m.ord_orcamento) as orcamentos_legado,
      coalesce(sum(opp.valor_orcamento) filter (where opp.max_order >= m.ord_orcamento), 0) as valor_orcamentos_legado,
      sum(opp.pares_orcamento) filter (where opp.max_order >= m.ord_orcamento) as pares_orcamentos_legado,
      count(*) filter (where opp.max_order >= m.ord_mockup) as mockups_legado,
      count(*) filter (where opp.max_order >= m.ord_negociacao) as negociacoes_legado
    from opp, marcos m
    where (opp.created_at at time zone 'America/Sao_Paulo')::date < date '2026-07-16'
    group by opp.ad_id
  ),
  -- Vendas pelo DIA DA VENDA na janela, qualquer que seja a data do lead
  -- (antes: só lead criado na janela -- 22% do faturamento de anúncio sumia).
  vendas_agg as (
    select
      p.chave_meta as ad_id,
      count(*) filter (where p.monetary_value > 0) as vendas,
      coalesce(sum(p.monetary_value), 0) as faturamento,
      sum(p.qty_pares) as pares_vendidos
    from public.v_pedidos_ganhos p
    cross join janela j
    where p.chave_meta is not null
      and p.dia_venda between j.ini and j.fim
    group by p.chave_meta
  ),
  webhook_eventos as (
    select
      e.contact_id,
      e.stage_slug,
      case
        when nullif(e.raw_payload->>'Utm Content', '') ~ '^[0-9]{10,}$' then e.raw_payload->>'Utm Content'
        else a.chave_meta
      end as ad_id,
      case when public.dado_par_plausivel(
             e.quantidade_pares,
             coalesce(nullif(e.raw_payload->>'Orçamento Total com Frete', '')::numeric,
                      nullif(e.raw_payload->>'Orçamento Subtotal', '')::numeric)
           )
           then e.quantidade_pares end as quantidade_pares,
      case when public.dado_par_plausivel(
             e.quantidade_pares,
             coalesce(nullif(e.raw_payload->>'Orçamento Total com Frete', '')::numeric,
                      nullif(e.raw_payload->>'Orçamento Subtotal', '')::numeric)
           )
           then coalesce(
                  nullif(e.raw_payload->>'Orçamento Total com Frete', '')::numeric,
                  nullif(e.raw_payload->>'Orçamento Subtotal', '')::numeric
                )
      end as valor_congelado
    from public.ghl_funnel_events e
    left join public.mv_contato_atribuicao a on a.contact_id = e.contact_id
    cross join janela j
    where (e.received_at at time zone 'America/Sao_Paulo')::date >= date '2026-07-16'
      and (e.received_at at time zone 'America/Sao_Paulo')::date between j.ini and j.fim
      and not exists (select 1 from public.v_importados_corte i_ where i_.contact_id = e.contact_id and e.received_at < i_.corte)
  ),
  webhook_por_contato as (
    select
      contact_id,
      max(ad_id) filter (where ad_id is not null) as ad_id,
      bool_or(stage_slug = 'solicitouorcamento') as reached_orcamento,
      bool_or(stage_slug = 'solicitoumockupoficial') as reached_mockup,
      bool_or(stage_slug = 'emnegociacao') as reached_negociacao,
      max(quantidade_pares) filter (where stage_slug = 'solicitoumockupoficial') as pares_congelado,
      max(valor_congelado) filter (where stage_slug = 'solicitoumockupoficial') as valor_congelado
    from webhook_eventos
    group by contact_id
  ),
  -- Uma oportunidade por contato (a mais recente): o left join antigo
  -- duplicava o contato que tinha duas oportunidades.
  webhook_com_opp as (
    select
      w.*,
      case when public.dado_par_plausivel(o.qty_pares, o.monetary_value) then o.monetary_value end as monetary_value_opp,
      case when public.dado_par_plausivel(o.qty_pares, o.monetary_value) then o.qty_pares end as qty_pares_opp,
      exists (
        select 1 from opp o2
        where o2.contact_id = w.contact_id and o2.ad_id = w.ad_id
      ) as ja_no_pipeline_deste_anuncio
    from webhook_por_contato w
    left join lateral (
      select op.monetary_value, op.qty_pares
      from public.ghl_opportunities op
      where op.contact_id = w.contact_id
      order by op.created_at desc
      limit 1
    ) o on true
  ),
  webhook_agg as (
    select
      ad_id,
      count(*) filter (where reached_orcamento) as orcamentos_webhook,
      coalesce(sum(coalesce(monetary_value_opp, valor_congelado)) filter (where reached_orcamento), 0) as valor_orcamentos_webhook,
      sum(coalesce(qty_pares_opp, pares_congelado)) filter (where reached_orcamento) as pares_orcamentos_webhook,
      count(*) filter (where reached_mockup) as mockups_webhook,
      count(*) filter (where reached_negociacao) as negociacoes_webhook,
      count(*) filter (where not ja_no_pipeline_deste_anuncio) as leads_orfaos_webhook
    from webhook_com_opp
    where ad_id is not null
    group by ad_id
  ),
  meta as (
    select
      m.ad_id,
      max(m.ad_name) as ad_name,
      max(m.campaign_id) as campaign_id,
      max(m.campaign_name) as campaign_name,
      max(m.adset_id) as adset_id,
      max(m.adset_name) as adset_name,
      sum(m.spend) as spend_total, sum(m.impressions) as impressoes,
      sum(m.clicks) as cliques, sum(m.leads) as leads_meta
    from public.meta_insights_daily m
    cross join janela j
    where m.date between j.ini and j.fim
    group by m.ad_id
  ),
  -- Nome/campanha de anúncio sem gasto NA JANELA (pausado antes) vem do
  -- histórico -- antes caía em "Sem investimento conhecido" e ficava fora
  -- da campanha no Top 5.
  nomes as (
    select distinct on (m.ad_id)
      m.ad_id, m.ad_name, m.campaign_id, m.campaign_name, m.adset_id, m.adset_name
    from public.meta_insights_daily m
    order by m.ad_id, m.date desc
  ),
  -- Venda que chegou pela bio com a campanha de origem no utm_campaign vira
  -- um "conjunto" próprio dentro da campanha (decisão do usuário, 30/09).
  bio as (
    select distinct on (m.campaign_id)
      'bio:' || m.campaign_id as ad_id,
      'Via bio do Instagram'::text as ad_name,
      m.campaign_id, m.campaign_name,
      'bio:' || m.campaign_id as adset_id,
      'Via bio do Instagram'::text as adset_name
    from public.meta_insights_daily m
    where m.campaign_id is not null
    order by m.campaign_id, m.date desc
  ),
  rotulos as (
    select * from nomes
    union all
    select * from bio
  ),
  todos_ad_ids as (
    select meta.ad_id from meta
    union select pipeline_agg.ad_id from pipeline_agg
    union select legado_agg.ad_id from legado_agg
    union select webhook_agg.ad_id from webhook_agg
    union select vendas_agg.ad_id from vendas_agg
  ),
  ghl as (
    select
      t.ad_id,
      coalesce(p.leads_total, 0) + coalesce(w.leads_orfaos_webhook, 0) as leads_ghl,
      coalesce(l.orcamentos_legado, 0) + coalesce(w.orcamentos_webhook, 0) as orcamentos,
      coalesce(l.valor_orcamentos_legado, 0) + coalesce(w.valor_orcamentos_webhook, 0) as valor_orcamentos,
      coalesce(l.pares_orcamentos_legado, 0) + coalesce(w.pares_orcamentos_webhook, 0) as pares_orcamentos,
      coalesce(l.mockups_legado, 0) + coalesce(w.mockups_webhook, 0) as mockups,
      coalesce(l.negociacoes_legado, 0) + coalesce(w.negociacoes_webhook, 0) as negociacoes,
      coalesce(v.vendas, 0) as vendas,
      coalesce(v.faturamento, 0) as faturamento,
      v.pares_vendidos,
      coalesce(p.leads_maduros, 0) as leads_maduros,
      coalesce(p.vendas_maduras, 0) as vendas_maduras
    from todos_ad_ids t
    left join pipeline_agg p on p.ad_id = t.ad_id
    left join legado_agg l on l.ad_id = t.ad_id
    left join webhook_agg w on w.ad_id = t.ad_id
    left join vendas_agg v on v.ad_id = t.ad_id
  ),
  thresholds as (
    select 2.0::numeric as roas_bom, 10::bigint as min_leads, 5.0::numeric as conv_minima
  )
  select
    g.ad_id,
    coalesce(m.ad_name, r.ad_name) as ad_name,
    coalesce(m.campaign_id, r.campaign_id) as campaign_id,
    coalesce(m.campaign_name, r.campaign_name) as campaign_name,
    coalesce(m.adset_id, r.adset_id) as adset_id,
    coalesce(m.adset_name, r.adset_name) as adset_name,
    coalesce(m.spend_total, 0) as spend_total,
    m.impressoes,
    m.cliques,
    m.leads_meta,
    case when m.leads_meta > 0 then round(m.spend_total / m.leads_meta, 2) end as cpl_meta,
    g.leads_ghl,
    g.orcamentos,
    g.valor_orcamentos,
    g.pares_orcamentos,
    g.mockups,
    g.negociacoes,
    g.vendas,
    g.faturamento,
    g.pares_vendidos,
    case when g.leads_ghl > 0 then round(m.spend_total / g.leads_ghl, 2) end as custo_por_lead,
    case when g.orcamentos > 0 then round(m.spend_total / g.orcamentos, 2) end as custo_por_orcamento,
    case when g.mockups > 0 then round(m.spend_total / g.mockups, 2) end as custo_por_mockup,
    case when g.negociacoes > 0 then round(m.spend_total / g.negociacoes, 2) end as custo_por_negociacao,
    case when g.vendas > 0 then round(m.spend_total / g.vendas, 2) end as cpa_venda,
    case when g.leads_ghl > 0 then round(100.0 * g.vendas / g.leads_ghl, 2) end as taxa_conversao_lead_venda,
    case when coalesce(m.spend_total, 0) > 0 then round(g.faturamento / m.spend_total, 2) end as roas,
    case
      when coalesce(m.spend_total, 0) > 0
           and g.faturamento / m.spend_total >= (select roas_bom from thresholds)
        then 'GERA VENDA'
      when g.leads_maduros >= (select min_leads from thresholds)
           and 100.0 * g.vendas_maduras / g.leads_maduros < (select conv_minima from thresholds)
        then 'LEAD BARATO VENDA CARA'
      else 'REVISAR'
    end as diagnostico
  from ghl g
  left join meta m on m.ad_id = g.ad_id
  left join rotulos r on r.ad_id = g.ad_id;
$function$;

-- get_desempenho_fonte
CREATE OR REPLACE FUNCTION public.get_desempenho_fonte(p_inicio date, p_fim date)
 RETURNS TABLE(fonte text, investimento numeric, leads bigint, cpl numeric, vendas bigint, faturamento numeric, roas numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with janela as (
    select greatest(p_inicio, public.meta_inicio_coleta()) as ini, p_fim as fim
  ),
  leads as (
    select coalesce(a.fonte, 'Outros') as fonte, count(*) as leads
    from public.ghl_opportunities o
    left join public.mv_contato_atribuicao a on a.contact_id = o.contact_id
    cross join janela j
    where (o.created_at at time zone 'America/Sao_Paulo')::date between j.ini and j.fim
      and not exists (select 1 from public.v_importados_corte i_ where i_.contact_id = o.contact_id and o.created_at < i_.corte)
    group by 1
  ),
  vendas as (
    select p.fonte,
      count(*) filter (where p.monetary_value > 0) as vendas,
      coalesce(sum(p.monetary_value), 0) as faturamento
    from public.v_pedidos_ganhos p
    cross join janela j
    where p.dia_venda between j.ini and j.fim
    group by 1
  ),
  gasto as (
    select 'Meta Ads'::text as fonte, coalesce(sum(m.spend), 0) as investimento
    from public.meta_insights_daily m
    cross join janela j
    where m.date between j.ini and j.fim
  ),
  fontes as (
    select fonte from leads union select fonte from vendas union select fonte from gasto
  )
  select
    f.fonte,
    g.investimento,
    coalesce(l.leads, 0) as leads,
    case when g.investimento is not null and coalesce(l.leads, 0) > 0 then round(g.investimento / l.leads, 2) end as cpl,
    coalesce(v.vendas, 0) as vendas,
    coalesce(v.faturamento, 0) as faturamento,
    case when g.investimento > 0 then round(coalesce(v.faturamento, 0) / g.investimento, 2) end as roas
  from fontes f
  left join leads l on l.fonte = f.fonte
  left join vendas v on v.fonte = f.fonte
  left join gasto g on g.fonte = f.fonte
  order by coalesce(v.faturamento, 0) desc, coalesce(l.leads, 0) desc;
$function$;

-- get_desempenho_uf
CREATE OR REPLACE FUNCTION public.get_desempenho_uf(p_inicio date DEFAULT NULL::date, p_fim date DEFAULT NULL::date)
 RETURNS TABLE(uf character, region_group text, mes date, estacao text, spend numeric, leads_meta numeric, leads_ghl bigint, mockups bigint, vendas bigint, faturamento numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
with lim as (
  select coalesce(p_inicio, date '2000-01-01') as ini, coalesce(p_fim, date '2999-12-31') as fim,
    (select stage_order from public.dim_pipeline_stages where stage_name = 'Amostra Digital Enviada') as ord_mockup
), meta_uf as (
  select m.uf, date_trunc('month', m.date)::date as mes, sum(m.spend) as spend, sum(m.leads) as leads_meta
  from public.meta_insights_daily m, lim
  where m.uf is not null and m.date between lim.ini and lim.fim
  group by 1, 2
), opp as (
  select o.id, c.uf, (o.created_at at time zone 'America/Sao_Paulo')::date as dia, o.stage_id
  from public.ghl_opportunities o
  join public.ghl_contacts c on c.id = o.contact_id, lim
  where c.uf is not null
    and (o.created_at at time zone 'America/Sao_Paulo')::date between lim.ini and lim.fim
    and not exists (select 1 from public.v_importados_corte i_ where i_.contact_id = o.contact_id and o.created_at < i_.corte)
), leads_uf as (
  select opp.uf, date_trunc('month', opp.dia)::date as mes, count(*) as leads_ghl from opp group by 1, 2
), alcance as (
  select s.opportunity_id, max(coalesce(d.stage_order, 0)) as max_order
  from public.ghl_stage_snapshots s
  join opp on opp.id = s.opportunity_id and opp.dia < date '2026-07-16'
  left join public.dim_pipeline_stages d on d.stage_id = s.stage_id
  group by 1
), legado_uf as (
  select o.uf, date_trunc('month', o.dia)::date as mes,
    count(*) filter (where greatest(coalesce(a.max_order, 0), coalesce(dcur.stage_order, 0)) >= lim.ord_mockup) as mockups_legado
  from opp o
  cross join lim
  left join alcance a on a.opportunity_id = o.id
  left join public.dim_pipeline_stages dcur on dcur.stage_id = o.stage_id
  where o.dia < date '2026-07-16'
  group by 1, 2
), webhook_uf as (
  select upper(nullif(e.raw_payload ->> 'Estado', ''))::character(2) as uf,
    date_trunc('month', (e.received_at at time zone 'America/Sao_Paulo')::date)::date as mes,
    count(*) as mockups_webhook
  from public.ghl_funnel_events e, lim
  where e.stage_slug = 'solicitoumockupoficial'
    and (e.received_at at time zone 'America/Sao_Paulo')::date >= date '2026-07-16'
    and (e.received_at at time zone 'America/Sao_Paulo')::date between lim.ini and lim.fim
    and length(upper(nullif(e.raw_payload ->> 'Estado', ''))) = 2
    and not exists (select 1 from public.v_importados_corte i_ where i_.contact_id = e.contact_id and e.received_at < i_.corte)
  group by 1, 2
), ghl_uf as (
  select coalesce(l.uf, lu.uf, wu.uf) as uf, coalesce(l.mes, lu.mes, wu.mes) as mes,
    coalesce(l.leads_ghl, 0) as leads_ghl,
    coalesce(lu.mockups_legado, 0) + coalesce(wu.mockups_webhook, 0) as mockups
  from leads_uf l
  full join legado_uf lu on lu.uf = l.uf and lu.mes = l.mes
  full join webhook_uf wu on wu.uf = coalesce(l.uf, lu.uf) and wu.mes = coalesce(l.mes, lu.mes)
), vendas_uf as (
  select p.uf, date_trunc('month', p.dia_venda)::date as mes,
    count(*) filter (where p.monetary_value > 0) as vendas,
    coalesce(sum(p.monetary_value), 0) as faturamento
  from public.v_pedidos_ganhos p, lim
  where p.uf is not null and p.dia_venda >= public.meta_inicio_coleta()
    and p.dia_venda between lim.ini and lim.fim
  group by 1, 2
)
select coalesce(m.uf, g.uf, ve.uf)::character(2), d.region_group,
  coalesce(m.mes, g.mes, ve.mes),
  public.estacao_do_mes(extract(month from coalesce(m.mes, g.mes, ve.mes))::integer),
  coalesce(m.spend, 0), coalesce(m.leads_meta, 0), coalesce(g.leads_ghl, 0)::bigint,
  coalesce(g.mockups, 0)::bigint, coalesce(ve.vendas, 0)::bigint, coalesce(ve.faturamento, 0)
from meta_uf m
full join ghl_uf g on g.uf = m.uf and g.mes = m.mes
full join vendas_uf ve on ve.uf = coalesce(m.uf, g.uf) and ve.mes = coalesce(m.mes, g.mes)
left join public.dim_region_group d on d.uf = coalesce(m.uf, g.uf, ve.uf)
$function$;

-- v_atribuicao_saude
CREATE OR REPLACE VIEW public.v_atribuicao_saude WITH (security_invoker=false) AS
WITH base AS (
         SELECT o.created_at,
            c.id,
            COALESCE(c.utm_content, ''::text) <> ''::text OR a.chave_meta IS NOT NULL AS identificado,
            c.ad_id ~ '^[0-9]{10,}$'::text OR a.chave_meta ~ '^[0-9]{10,}$'::text AS ad_especifico,
            c.ad_id ~ '^[0-9]{10,}$'::text OR a.chave_meta ~ '^[0-9]{10,}$'::text OR c.ad_id = 'link_in_bio'::text OR lower(COALESCE(NULLIF(c.utm_source, ''::text), NULLIF(c.source, ''::text), ''::text)) ~ '(facebook|instagram|meta|^fb$)'::text AS meta
           FROM ghl_opportunities o
             JOIN ghl_contacts c ON c.id = o.contact_id
             LEFT JOIN v_contato_atribuicao a ON a.contact_id = c.id
          WHERE NOT (EXISTS ( SELECT 1 FROM v_importados_corte vi WHERE vi.contact_id = c.id AND o.created_at < vi.corte))
        )
 SELECT date_trunc('week'::text, (created_at AT TIME ZONE 'America/Sao_Paulo'::text))::date AS semana,
    count(DISTINCT id) AS contatos,
    count(DISTINCT id) FILTER (WHERE identificado) AS com_utm,
    round(100.0 * count(DISTINCT id) FILTER (WHERE identificado)::numeric / NULLIF(count(DISTINCT id), 0)::numeric, 1) AS pct_com_utm,
    count(DISTINCT id) FILTER (WHERE identificado AND meta) AS com_match_meta,
    round(100.0 * count(DISTINCT id) FILTER (WHERE identificado AND meta)::numeric / NULLIF(count(DISTINCT id) FILTER (WHERE identificado), 0)::numeric, 1) AS pct_match_meta,
    count(DISTINCT id) FILTER (WHERE ad_especifico) AS com_ad_especifico,
    round(100.0 * count(DISTINCT id) FILTER (WHERE ad_especifico)::numeric / NULLIF(count(DISTINCT id) FILTER (WHERE identificado AND meta), 0)::numeric, 1) AS pct_ad_especifico
   FROM base
  GROUP BY (date_trunc('week'::text, (created_at AT TIME ZONE 'America/Sao_Paulo'::text))::date)
  ORDER BY (date_trunc('week'::text, (created_at AT TIME ZONE 'America/Sao_Paulo'::text))::date) DESC;

-- v_contato_atribuicao
CREATE OR REPLACE VIEW public.v_contato_atribuicao WITH (security_invoker=true) AS
WITH campanhas AS (
         SELECT DISTINCT m.campaign_id
           FROM meta_insights_daily m
          WHERE m.campaign_id IS NOT NULL
        ), nomes AS (
         SELECT lower(regexp_replace(m.ad_name, '[^a-zA-Z0-9]'::text, ''::text, 'g'::text)) AS nome,
            min(m.ad_id) AS ad_id
           FROM meta_insights_daily m
          WHERE COALESCE(m.ad_name, ''::text) <> ''::text
          GROUP BY (lower(regexp_replace(m.ad_name, '[^a-zA-Z0-9]'::text, ''::text, 'g'::text)))
         HAVING count(DISTINCT m.ad_id) = 1
        ), nomes_dia AS (
         SELECT lower(regexp_replace(m.ad_name, '[^a-zA-Z0-9]'::text, ''::text, 'g'::text)) AS nome,
            m.date AS dia,
            min(m.ad_id) AS ad_id
           FROM meta_insights_daily m
          WHERE COALESCE(m.ad_name, ''::text) <> ''::text AND COALESCE(m.link_clicks, 0::bigint) > 0
          GROUP BY (lower(regexp_replace(m.ad_name, '[^a-zA-Z0-9]'::text, ''::text, 'g'::text))), m.date
         HAVING count(DISTINCT m.ad_id) = 1
        ), base AS (
         SELECT c.id AS contact_id,
            c.ad_id,
            c.utm_campaign,
            lower(COALESCE(NULLIF(c.utm_source, ''::text), NULLIF(c.source, ''::text), ''::text)) AS origem,
            NULLIF(lower(NULLIF(c.utm_source, ''::text)), 'website'::text) AS utm_source_real,
            (EXISTS ( SELECT 1 FROM v_importados_corte i WHERE i.contact_id = c.id AND i.corte = 'infinity'::timestamp with time zone)) AS importado,
            c.ad_id = 'link_in_bio'::text AND (c.utm_campaign IN ( SELECT campanhas.campaign_id
                   FROM campanhas)) AS bio_com_campanha,
            NULLIF(lower(regexp_replace(COALESCE(c.utm_content, ''::text), '[^a-zA-Z0-9]'::text, ''::text, 'g'::text)), ''::text) AS nome_content,
            NULLIF(lower(regexp_replace(COALESCE(c.utm_medium, ''::text), '[^a-zA-Z0-9]'::text, ''::text, 'g'::text)), ''::text) AS nome_medium,
            (c.created_at AT TIME ZONE 'America/Sao_Paulo'::text)::date AS dia
           FROM ghl_contacts c
        ), classif AS (
         SELECT b.contact_id,
            b.ad_id,
            b.utm_campaign,
            b.origem,
            b.utm_source_real,
            b.importado,
            b.bio_com_campanha,
            b.ad_id ~ '^[0-9]{10,}$'::text AND (NOT b.importado OR (EXISTS ( SELECT 1
                   FROM meta_ad_attributes a
                  WHERE a.ad_id = b.ad_id))) AS anuncio_meta,
                CASE
                    WHEN b.importado THEN NULL::text
                    ELSE COALESCE(n1.ad_id, n2.ad_id, nd.ad_id)
                END AS anuncio_por_nome
           FROM base b
             LEFT JOIN nomes n1 ON n1.nome = b.nome_content
             LEFT JOIN nomes n2 ON n2.nome = b.nome_medium
             LEFT JOIN nomes_dia nd ON nd.nome = b.nome_medium AND nd.dia = b.dia
        )
 SELECT contact_id,
        CASE
            WHEN anuncio_meta THEN ad_id
            WHEN bio_com_campanha THEN 'bio:'::text || utm_campaign
            WHEN anuncio_por_nome IS NOT NULL THEN anuncio_por_nome
            ELSE NULL::text
        END AS chave_meta,
        CASE
            WHEN anuncio_meta OR bio_com_campanha OR anuncio_por_nome IS NOT NULL THEN 'Meta Ads'::text
            WHEN importado THEN 'Base antiga (CRM anterior)'::text
            WHEN ad_id = 'link_in_bio'::text OR origem ~ '(facebook|instagram|meta|^fb$)'::text THEN 'Instagram/Facebook (perfil)'::text
            WHEN origem ~ 'google'::text THEN 'Google Ads'::text
            WHEN origem ~ '(indica|referral)'::text THEN 'Indicação'::text
            WHEN utm_source_real IS NULL THEN 'Orgânico'::text
            ELSE 'Outros'::text
        END AS fonte
   FROM classif;

-- v_utm_sem_match
CREATE OR REPLACE VIEW public.v_utm_sem_match AS
SELECT utm_content,
    max(utm_campaign) AS utm_campaign,
    max(utm_source) AS utm_source,
    count(*) AS qtd_contatos,
    max(created_at) AS ultimo_contato
   FROM ghl_contacts c
  WHERE utm_content ~ '^[0-9]{10,}$'::text AND NOT (EXISTS ( SELECT 1
           FROM meta_insights_daily m
          WHERE m.ad_id = c.utm_content)) AND NOT (EXISTS ( SELECT 1
           FROM meta_ad_attributes a
          WHERE a.ad_id = c.utm_content)) AND NOT (id IN ( SELECT v_importados_corte.contact_id FROM v_importados_corte WHERE v_importados_corte.corte = 'infinity'::timestamp with time zone))
  GROUP BY utm_content
  ORDER BY (count(*)) DESC;

-- v_vendas
CREATE OR REPLACE VIEW public.v_vendas AS
SELECT o.id,
    o.contact_id,
    o.pipeline_id,
    o.pipeline_name,
    o.stage_id,
    o.stage_name,
    o.monetary_value,
    COALESCE(o.qty_pares, c.qty_pares) AS qty_pares,
    COALESCE(o.won_at, o.updated_at) AS venda_em,
    ghl_dia_venda(o.raw, COALESCE(o.won_at, o.updated_at)) AS dia_venda
   FROM ghl_opportunities o
     LEFT JOIN ghl_contacts c ON c.id = o.contact_id
  WHERE o.status = 'won'::text AND NOT (EXISTS ( SELECT 1 FROM v_importados_corte i_ WHERE i_.contact_id = o.contact_id AND o.created_at < i_.corte));
