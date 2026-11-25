-- ============================================================
-- Cliente antigo do ActiveCampaign não conta como lead/cliente novo (2026-11-25)
--
-- Auditoria de 25/11: de 130 vendas com anúncio da Meta fechadas de 15/08 a
-- 24/11, 28 são de contatos criados pela importação do AC (03/08, 11:52-12:04
-- UTC). Só 1 delas tinha corte em v_importados_corte; as outras 27 eram
-- tratadas como cliente novo desde sempre.
--
-- Causa: não era falta de tag (27.618 dos 27.621 contatos da rajada têm
-- "import-03-08-26"). Era a válvula venda_real_fora_da_rajada, de 18/08,
-- anterior ao corte do PR #77: contato importado que comprou depois saía
-- inteiro da lista de importados, então o corte nunca valia para ele e até os
-- negócios carimbados pela importação voltavam a contar. Pegava 52 contatos
-- (48 da rajada de 03/08 e 4 do lote "ActiveCampaign migration" de 08/08,
-- cuja "venda" era o carimbo de 08/08). Mais 2 contatos da rajada não tinham
-- marcador nenhum.
--
-- 1) v_contatos_importados_source: sai a válvula; entra a rajada de contatos
--    (minuto com 50 ou mais contatos criados; um minuto normal tem no máximo
--    7). A volta do cliente antigo fica com o corte do PR #77: 1 dia antes do
--    primeiro webhook de lead depois da importação, nunca antes de 1 dia
--    depois dela, infinito se nunca voltou.
-- 2) v_vendas (régua de follow-up): o corte do PR #77 tiraria a venda real do
--    cliente antigo feita em negócio anterior ao corte (a equipe reabre o
--    negócio ou cria um sem webhook de lead). A exceção que era por contato
--    passa a ser por negócio: venda com valor, ganha fora do dia da rajada e
--    fora do lote "ActiveCampaign migration".
-- 3) get_funnel_por_anuncio ganha a quebra do cliente antigo que voltou:
--    leads_retorno, mockups_retorno, vendas_retorno, faturamento_retorno e
--    cpa_venda_novo (investimento / vendas de cliente novo). As colunas de
--    sempre continuam somando os dois.
-- 4) _kpis_periodo (Visão Geral) ganha as mesmas chaves *_retorno.
--
-- "Retorno" = contato da lista de importados. Lead, mockup e negociação dele
-- só aparecem depois do corte; venda aparece pela data da venda, como antes.
-- Definições geradas a partir das de produção em 25/11 (iguais às do PR #77).
-- ============================================================

-- 1) Lista de importados
CREATE OR REPLACE VIEW public.v_contatos_importados_source
WITH (security_invoker = true) AS
WITH dias_rajada AS MATERIALIZED (
  SELECT (o.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia
  FROM public.ghl_opportunities o
  GROUP BY 1
  HAVING count(*) > 1000
),
-- Importação cria contatos aos milhares por minuto (03/08: até 4.924; 08/08:
-- 145); o dia mais cheio de lead real não passa de 7 contatos num minuto.
minutos_rajada_contatos AS MATERIALIZED (
  SELECT date_trunc('minute', c.created_at) AS minuto
  FROM public.ghl_contacts c
  GROUP BY 1
  HAVING count(*) >= 50
)
SELECT t.contact_id
FROM public.ghl_contact_tags t
WHERE t.tag ILIKE '%import%'
UNION
SELECT e.contact_id
FROM public.ghl_funnel_events e
WHERE EXISTS (SELECT 1 FROM unnest(e.tags) tag(tag) WHERE tag.tag ILIKE '%import%')
UNION
SELECT o.contact_id
FROM public.ghl_opportunities o
  JOIN dias_rajada d ON d.dia = (o.created_at AT TIME ZONE 'America/Sao_Paulo')::date
  LEFT JOIN public.ghl_contacts c ON c.id = o.contact_id
WHERE c.id IS NULL
UNION
SELECT o.contact_id
FROM public.ghl_opportunities o
WHERE (o.raw ->> 'source') ILIKE '%activecampaign migration%'
UNION
SELECT c.id
FROM public.ghl_contacts c
  JOIN minutos_rajada_contatos m ON m.minuto = date_trunc('minute', c.created_at)
UNION
SELECT t.contact_id
FROM public.ghl_contact_tags t
WHERE t.tag = 'ia-teste'
UNION
SELECT e.contact_id
FROM public.ghl_funnel_events e
WHERE 'ia-teste' = ANY (e.tags)
UNION
SELECT o.contact_id
FROM public.ghl_opportunities o
WHERE ((o.raw -> 'contact') -> 'tags') ? 'ia-teste'
   OR (o.raw ->> 'name') ILIKE '(TESTE IA)%';

-- 2) v_vendas
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
    public.ghl_dia_venda(o.raw, COALESCE(o.won_at, o.updated_at)) AS dia_venda
   FROM public.ghl_opportunities o
     LEFT JOIN public.ghl_contacts c ON c.id = o.contact_id
  WHERE o.status = 'won'::text
    AND (
      NOT (EXISTS ( SELECT 1 FROM public.v_importados_corte i_ WHERE i_.contact_id = o.contact_id AND o.created_at < i_.corte))
      -- Venda real de cliente antigo em negócio anterior ao corte. O carimbo da
      -- importação é ganho no próprio dia da rajada ou no lote de 08/08.
      OR (o.monetary_value > 0::numeric
          AND COALESCE(o.raw ->> 'source', '') NOT ILIKE '%activecampaign migration%'
          AND (COALESCE(o.won_at, o.updated_at) AT TIME ZONE 'America/Sao_Paulo')::date NOT IN (
            SELECT (r.created_at AT TIME ZONE 'America/Sao_Paulo')::date
            FROM public.ghl_opportunities r
            GROUP BY 1
            HAVING count(*) > 1000))
    );

-- 3) get_funnel_por_anuncio: novas colunas no fim (muda o tipo de retorno).
DROP FUNCTION public.get_funnel_por_anuncio(date, date);

CREATE FUNCTION public.get_funnel_por_anuncio(p_inicio date, p_fim date)
 RETURNS TABLE(ad_id text, ad_name text, campaign_id text, campaign_name text, adset_id text, adset_name text, spend_total numeric, impressoes bigint, cliques bigint, leads_meta numeric, cpl_meta numeric, leads_ghl bigint, orcamentos bigint, valor_orcamentos numeric, pares_orcamentos bigint, mockups bigint, negociacoes bigint, vendas bigint, faturamento numeric, pares_vendidos bigint, custo_por_lead numeric, custo_por_orcamento numeric, custo_por_mockup numeric, custo_por_negociacao numeric, cpa_venda numeric, taxa_conversao_lead_venda numeric, roas numeric, diagnostico text, leads_retorno bigint, mockups_retorno bigint, vendas_retorno bigint, faturamento_retorno numeric, cpa_venda_novo numeric)
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
      greatest(coalesce(al.max_order, 0), coalesce(dcur.stage_order, 0)) as max_order,
      -- Cliente antigo que voltou: contato da base importada (só chega aqui
      -- oportunidade criada depois do corte dele).
      exists (select 1 from public.mv_contatos_importados ci where ci.contact_id = o.contact_id) as retorno
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
      count(distinct opp.contact_id) filter (where opp.retorno) as leads_retorno,
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
      count(*) filter (where opp.max_order >= m.ord_mockup and opp.retorno) as mockups_legado_retorno,
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
      sum(p.qty_pares) as pares_vendidos,
      count(*) filter (where p.monetary_value > 0 and ci.contact_id is not null) as vendas_retorno,
      coalesce(sum(p.monetary_value) filter (where ci.contact_id is not null), 0) as faturamento_retorno
    from public.v_pedidos_ganhos p
    left join public.mv_contatos_importados ci on ci.contact_id = p.contact_id
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
      ) as ja_no_pipeline_deste_anuncio,
      exists (select 1 from public.mv_contatos_importados ci where ci.contact_id = w.contact_id) as retorno
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
      count(*) filter (where reached_mockup and retorno) as mockups_webhook_retorno,
      count(*) filter (where reached_negociacao) as negociacoes_webhook,
      count(*) filter (where not ja_no_pipeline_deste_anuncio) as leads_orfaos_webhook,
      count(*) filter (where not ja_no_pipeline_deste_anuncio and retorno) as leads_orfaos_webhook_retorno
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
      coalesce(p.vendas_maduras, 0) as vendas_maduras,
      coalesce(p.leads_retorno, 0) + coalesce(w.leads_orfaos_webhook_retorno, 0) as leads_retorno,
      coalesce(l.mockups_legado_retorno, 0) + coalesce(w.mockups_webhook_retorno, 0) as mockups_retorno,
      coalesce(v.vendas_retorno, 0) as vendas_retorno,
      coalesce(v.faturamento_retorno, 0) as faturamento_retorno
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
    end as diagnostico,
    g.leads_retorno,
    g.mockups_retorno,
    g.vendas_retorno,
    g.faturamento_retorno,
    case when g.vendas - g.vendas_retorno > 0 then round(m.spend_total / (g.vendas - g.vendas_retorno), 2) end as cpa_venda_novo
  from ghl g
  left join meta m on m.ad_id = g.ad_id
  left join rotulos r on r.ad_id = g.ad_id;
$function$;

REVOKE ALL ON FUNCTION public.get_funnel_por_anuncio(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_funnel_por_anuncio(date, date) TO service_role;

-- 4) _kpis_periodo
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
  v_leads_retorno bigint;
  v_vendas bigint;
  v_faturamento numeric;
  v_faturamento_com_pares numeric;
  v_vendas_sem_pares bigint;
  v_pares bigint;
  v_faturamento_meta numeric;
  v_vendas_meta bigint;
  v_vendas_retorno bigint;
  v_faturamento_retorno numeric;
  v_vendas_meta_retorno bigint;
  v_faturamento_meta_retorno numeric;
  v_mockups bigint;
  v_mockups_legado bigint;
  v_mockups_webhook bigint;
  v_mockups_retorno bigint;
  v_mockups_legado_retorno bigint;
  v_mockups_webhook_retorno bigint;
  v_ord_mockup int;
begin
  select coalesce(sum(spend), 0), coalesce(sum(impressions), 0), coalesce(sum(clicks), 0)
    into v_spend, v_impressoes, v_cliques
  from public.meta_insights_daily
  where date between v_ini and p_fim;

  select stage_order into v_ord_mockup
  from public.dim_pipeline_stages where stage_name = 'Amostra Digital Enviada';

  -- Lead = oportunidade criada no período, fora da base importada (cliente
  -- antigo só conta depois do corte, e aparece também em leads_retorno).
  select count(*),
         count(*) filter (where exists (select 1 from public.mv_contatos_importados ci where ci.contact_id = o.contact_id))
    into v_leads, v_leads_retorno
  from public.ghl_opportunities o
  where (o.created_at at time zone 'America/Sao_Paulo')::date between v_ini and p_fim
    and not exists (select 1 from public.v_importados_corte i_ where i_.contact_id = o.contact_id and o.created_at < i_.corte);

  select count(*),
         count(*) filter (where exists (select 1 from public.mv_contatos_importados ci where ci.contact_id = o.contact_id))
    into v_mockups_legado, v_mockups_legado_retorno
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

  select count(*) filter (where e.stage_slug = 'solicitoumockupoficial'),
         count(*) filter (where e.stage_slug = 'solicitoumockupoficial'
                            and exists (select 1 from public.mv_contatos_importados ci where ci.contact_id = e.contact_id))
    into v_mockups_webhook, v_mockups_webhook_retorno
  from public.ghl_funnel_events e
  where (e.received_at at time zone 'America/Sao_Paulo')::date between v_ini and p_fim
    and (e.received_at at time zone 'America/Sao_Paulo')::date >= date '2026-07-16'
    and not exists (select 1 from public.v_importados_corte i_ where i_.contact_id = e.contact_id and e.received_at < i_.corte);

  v_mockups := coalesce(v_mockups_legado, 0) + coalesce(v_mockups_webhook, 0);
  v_mockups_retorno := coalesce(v_mockups_legado_retorno, 0) + coalesce(v_mockups_webhook_retorno, 0);

  select
    count(*) filter (where p.monetary_value > 0),
    coalesce(sum(p.monetary_value), 0),
    sum(p.qty_pares),
    coalesce(sum(p.monetary_value) filter (where p.qty_pares is not null), 0),
    count(*) filter (where p.qty_pares is null and p.monetary_value > 0),
    coalesce(sum(p.monetary_value) filter (where p.chave_meta is not null), 0),
    count(*) filter (where p.chave_meta is not null and p.monetary_value > 0),
    count(*) filter (where p.monetary_value > 0 and ci.contact_id is not null),
    coalesce(sum(p.monetary_value) filter (where ci.contact_id is not null), 0),
    count(*) filter (where p.chave_meta is not null and p.monetary_value > 0 and ci.contact_id is not null),
    coalesce(sum(p.monetary_value) filter (where p.chave_meta is not null and ci.contact_id is not null), 0)
    into v_vendas, v_faturamento, v_pares, v_faturamento_com_pares, v_vendas_sem_pares,
         v_faturamento_meta, v_vendas_meta,
         v_vendas_retorno, v_faturamento_retorno, v_vendas_meta_retorno, v_faturamento_meta_retorno
  from public.v_pedidos_ganhos p
  left join public.mv_contatos_importados ci on ci.contact_id = p.contact_id
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
    'custo_por_mockup', case when v_mockups > 0 then round(v_spend / v_mockups, 2) end,
    'leads_retorno', v_leads_retorno,
    'mockups_retorno', v_mockups_retorno,
    'vendas_retorno', v_vendas_retorno,
    'faturamento_retorno', v_faturamento_retorno,
    'vendas_meta_retorno', v_vendas_meta_retorno,
    'faturamento_meta_retorno', v_faturamento_meta_retorno
  );
end;
$function$;

-- 5) Recalcula as listas com a regra nova (o cron das :07/:37 segue igual).
REFRESH MATERIALIZED VIEW public.mv_contatos_importados;
REFRESH MATERIALIZED VIEW public.mv_contato_atribuicao;
