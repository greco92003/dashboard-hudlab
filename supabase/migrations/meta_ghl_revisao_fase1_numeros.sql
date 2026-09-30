-- Revisão do Meta Marketing / GHL, fase 1 (2026-09-30).
-- Estado FINAL dos objetos, extraído do banco depois de aplicado e validado
-- (as migrations intermediárias fase1_meta_* ficaram no histórico do Supabase).
--
-- O que muda:
--  * Venda pelo DIA DA VENDA com a mesma regra do /dashboard (ghl_dia_venda:
--    mudança de status; pedido migrado em 2026-08-03 usa "Data de Fechamento").
--  * v_pedidos_ganhos: todo pedido ganho (inclui cliente da base antiga), base
--    única de faturamento do módulo. v_vendas fica como estava, só ganhou
--    dia_venda (get_followup_regua depende da regra dela).
--  * v_contato_atribuicao: uma regra de atribuição e de fonte; bio com campanha
--    de origem vira bio:<campaign_id> (decisão do usuário, 30/09).
--  * Aba Anúncios / Top 5: venda pela data da venda (antes, só lead criado na
--    janela: 11 de 29 vendas de anúncio, R$ 14,8 mil, sumiam), vendas via bio,
--    nome de anúncio pausado vindo do histórico, sem contagem dupla no webhook,
--    sem o corte de 1.000 pares na venda ganha.
--  * Cards: pedidos (não clientes), ROAS geral + ROAS Meta, recorte no início
--    da coleta (meta_inicio_coleta), variação só com dias fechados.
--  * Gráfico diário (get_serie_diaria) e Performance por fonte
--    (get_desempenho_fonte) somados no banco e no período selecionado.
--  * Regiões sem dupla contagem (+56%), leads frios sem a base importada,
--    UTM sem match sem anúncio antigo da conta.
--  * reconciliacao_meta_ghl(inicio, fim): confere que cada número que aparece
--    em mais de um lugar bate e lista, pedido a pedido, o que diverge do /dashboard.
--  * Desempenho: dia da venda indexado e atribuição pronta (mv_contato_atribuicao);
--    get_funnel_por_anuncio só lê snapshots das oportunidades do braço legado.

CREATE OR REPLACE FUNCTION public.ghl_data_campo(p_valor text)
 RETURNS date
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v text := btrim(coalesce(p_valor, ''));
  m text[];
begin
  if v = '' then return null; end if;
  if v ~ '^\d{4}-\d{2}-\d{2}' then return left(v, 10)::date; end if;
  m := regexp_match(v, '^(\d{1,2})/(\d{1,2})/(\d{4})');
  if m is not null then return make_date(m[3]::int, m[2]::int, m[1]::int); end if;
  return null;
exception when others then
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ghl_dia_venda(p_raw jsonb, p_won_at timestamp with time zone)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  with x as (
    select
      (p_won_at at time zone 'America/Sao_Paulo')::date as pela_mudanca,
      public.ghl_data_campo((
        select cf->>'fieldValueString'
        from jsonb_array_elements(coalesce(p_raw->'customFields', '[]'::jsonb)) cf
        where cf->>'id' = 'TMojRtjFJonpuabeYtYU'
        limit 1
      )) as pelo_campo
  )
  select case
    when pela_mudanca = date '2026-08-03'
         and pelo_campo is not null
         and pelo_campo <> date '2026-08-03'
      then pelo_campo
    else coalesce(pela_mudanca, pelo_campo)
  end
  from x;
$function$
;

-- Dia da venda indexado (a função é determinística).
create index if not exists idx_ghlo_won_dia_venda
  on public.ghl_opportunities (public.ghl_dia_venda(raw, coalesce(won_at, updated_at)))
  where status = 'won';

CREATE OR REPLACE FUNCTION public.meta_inicio_coleta()
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$ select date '2026-07-01' $function$
;

create or replace view public.v_contato_atribuicao
with (security_invoker = true)
as
 WITH campanhas AS (
         SELECT DISTINCT meta_insights_daily.campaign_id
           FROM public.meta_insights_daily
          WHERE meta_insights_daily.campaign_id IS NOT NULL
        ), base AS (
         SELECT c.id AS contact_id,
            c.ad_id,
            c.utm_campaign,
            lower(COALESCE(NULLIF(c.utm_source, ''::text), NULLIF(c.source, ''::text), ''::text)) AS origem,
            NULLIF(lower(NULLIF(c.utm_source, ''::text)), 'website'::text) AS utm_source_real,
            (EXISTS ( SELECT 1
                   FROM public.v_contatos_importados i
                  WHERE i.contact_id = c.id)) AS importado,
            c.ad_id = 'link_in_bio'::text AND (c.utm_campaign IN ( SELECT campanhas.campaign_id
                   FROM campanhas)) AS bio_com_campanha
           FROM public.ghl_contacts c
        ), classif AS (
         SELECT b.contact_id,
            b.ad_id,
            b.utm_campaign,
            b.origem,
            b.utm_source_real,
            b.importado,
            b.bio_com_campanha,
            b.ad_id ~ '^[0-9]{10,}$'::text AND (NOT b.importado OR (EXISTS ( SELECT 1
                   FROM public.meta_ad_attributes a
                  WHERE a.ad_id = b.ad_id))) AS anuncio_meta
           FROM base b
        )
 SELECT contact_id,
        CASE
            WHEN anuncio_meta THEN ad_id
            WHEN bio_com_campanha THEN 'bio:'::text || utm_campaign
            ELSE NULL::text
        END AS chave_meta,
        CASE
            WHEN anuncio_meta OR bio_com_campanha THEN 'Meta Ads'::text
            WHEN importado THEN 'Base antiga (CRM anterior)'::text
            WHEN ad_id = 'link_in_bio'::text OR origem ~ '(facebook|instagram|meta|^fb$)'::text THEN 'Instagram/Facebook (perfil)'::text
            WHEN origem ~ 'google'::text THEN 'Google Ads'::text
            WHEN origem ~ '(indica|referral)'::text THEN 'Indicação'::text
            WHEN utm_source_real IS NULL THEN 'Orgânico'::text
            ELSE 'Outros'::text
        END AS fonte
   FROM classif;

-- Atribuição pronta por contato; a regra fica em v_contato_atribuicao.
-- Atualizada junto com mv_contatos_importados (cron a cada 30 min).
create materialized view if not exists public.mv_contato_atribuicao as
select contact_id, chave_meta, fonte from public.v_contato_atribuicao;
create unique index if not exists mv_contato_atribuicao_contact_id_idx on public.mv_contato_atribuicao (contact_id);
create index if not exists mv_contato_atribuicao_chave_meta_idx on public.mv_contato_atribuicao (chave_meta) where chave_meta is not null;
revoke all on public.mv_contato_atribuicao from anon, public;
grant select on public.mv_contato_atribuicao to authenticated, service_role;
select cron.alter_job(
  (select jobid from cron.job where jobname = 'refresh-contatos-importados-30min'),
  command := 'refresh materialized view concurrently public.mv_contatos_importados; refresh materialized view concurrently public.mv_contato_atribuicao;'
);

create or replace view public.v_vendas
as
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
  WHERE o.status = 'won'::text AND NOT (o.contact_id IN ( SELECT v_contatos_importados.contact_id
           FROM public.v_contatos_importados));

create or replace view public.v_pedidos_ganhos
with (security_invoker = true)
as
 SELECT o.id,
    o.contact_id,
    o.monetary_value,
    COALESCE(o.qty_pares, c.qty_pares) AS qty_pares,
    public.ghl_dia_venda(o.raw, COALESCE(o.won_at, o.updated_at)) AS dia_venda,
    a.chave_meta,
    COALESCE(a.fonte, 'Outros'::text) AS fonte,
    c.uf
   FROM public.ghl_opportunities o
     LEFT JOIN public.ghl_contacts c ON c.id = o.contact_id
     LEFT JOIN public.mv_contato_atribuicao a ON a.contact_id = o.contact_id
  WHERE o.status = 'won'::text;

create or replace view public.v_vendas_sem_pares
as
 SELECT p.id AS opportunity_id,
    p.contact_id,
    c.first_name,
    c.last_name,
    c.email,
    c.phone,
    p.monetary_value,
    COALESCE(o.won_at, o.updated_at) AS venda_em,
    p.dia_venda
   FROM public.v_pedidos_ganhos p
     JOIN public.ghl_opportunities o ON o.id = p.id
     LEFT JOIN public.ghl_contacts c ON c.id = p.contact_id
  WHERE p.qty_pares IS NULL AND p.monetary_value > 0::numeric
  ORDER BY p.dia_venda DESC;

CREATE OR REPLACE FUNCTION public._kpis_periodo(p_inicio date, p_fim date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
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
    and o.contact_id not in (select contact_id from public.v_contatos_importados);

  select count(*) into v_mockups_legado
  from public.ghl_opportunities o
  where (o.created_at at time zone 'America/Sao_Paulo')::date between v_ini and p_fim
    and (o.created_at at time zone 'America/Sao_Paulo')::date < date '2026-07-16'
    and o.contact_id not in (select contact_id from public.v_contatos_importados)
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
    and e.contact_id not in (select contact_id from public.v_contatos_importados);

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
$function$
;

CREATE OR REPLACE FUNCTION public.get_resumo_periodo(p_inicio date, p_fim date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_coleta date := public.meta_inicio_coleta();
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ini date := greatest(p_inicio, v_coleta);
  v_fim_fechado date := least(p_fim, v_hoje - 1);
  v_dias int;
  v_ant_ini date;
  v_ant_fim date;
  v_atual jsonb;
  v_atual_fechado jsonb;
  v_anterior jsonb;
  v_var jsonb := '{}'::jsonb;
  v_motivo text;
  k text;
  a numeric;
  b numeric;
begin
  v_atual := public._kpis_periodo(v_ini, p_fim);

  if v_fim_fechado < v_ini then
    v_motivo := 'sem_dia_fechado';
  else
    v_dias := v_fim_fechado - v_ini;
    v_ant_fim := v_ini - 1;
    v_ant_ini := v_ant_fim - v_dias;
    if v_ant_ini < v_coleta then
      v_motivo := 'anterior_antes_da_coleta';
    else
      v_atual_fechado := case when v_fim_fechado = p_fim then v_atual
                              else public._kpis_periodo(v_ini, v_fim_fechado) end;
      v_anterior := public._kpis_periodo(v_ant_ini, v_ant_fim);
      for k in select jsonb_object_keys(v_atual_fechado) loop
        if jsonb_typeof(v_atual_fechado -> k) = 'number' and jsonb_typeof(v_anterior -> k) = 'number' then
          a := (v_atual_fechado ->> k)::numeric;
          b := (v_anterior ->> k)::numeric;
          if b <> 0 then
            v_var := v_var || jsonb_build_object(k, round(100.0 * (a - b) / b, 1));
          end if;
        end if;
      end loop;
    end if;
  end if;

  return jsonb_build_object(
    'atual', v_atual,
    'anterior', v_anterior,
    'variacao_pct', v_var,
    'inicio_efetivo', v_ini,
    'comparacao', jsonb_build_object(
      'atual_inicio', v_ini,
      'atual_fim', case when v_motivo is null then v_fim_fechado end,
      'anterior_inicio', v_ant_ini,
      'anterior_fim', v_ant_fim,
      'sem_comparacao', v_motivo
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_funnel_por_anuncio(p_inicio date, p_fim date)
 RETURNS TABLE(ad_id text, ad_name text, campaign_id text, campaign_name text, adset_id text, adset_name text, spend_total numeric, impressoes bigint, cliques bigint, leads_meta numeric, cpl_meta numeric, leads_ghl bigint, orcamentos bigint, valor_orcamentos numeric, pares_orcamentos bigint, mockups bigint, negociacoes bigint, vendas bigint, faturamento numeric, pares_vendidos bigint, custo_por_lead numeric, custo_por_orcamento numeric, custo_por_mockup numeric, custo_por_negociacao numeric, cpa_venda numeric, taxa_conversao_lead_venda numeric, roas numeric, diagnostico text)
 LANGUAGE sql
 STABLE
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
      and o.contact_id not in (select contact_id from public.v_contatos_importados)
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
      and e.contact_id not in (select contact_id from public.v_contatos_importados)
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_serie_diaria(p_inicio date, p_fim date)
 RETURNS TABLE(dia date, investimento numeric, faturamento numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with dias as (
    select d::date as dia from generate_series(p_inicio, p_fim, interval '1 day') d
  ),
  gasto as (
    select m.date as dia, sum(m.spend) as total
    from public.meta_insights_daily m
    where m.date between p_inicio and p_fim
    group by m.date
  ),
  vendas as (
    select p.dia_venda as dia, sum(p.monetary_value) as total
    from public.v_pedidos_ganhos p
    where p.dia_venda between p_inicio and p_fim
    group by p.dia_venda
  )
  select d.dia, coalesce(g.total, 0), coalesce(v.total, 0)
  from dias d
  left join gasto g on g.dia = d.dia
  left join vendas v on v.dia = d.dia
  order by d.dia;
$function$
;

CREATE OR REPLACE FUNCTION public.get_desempenho_fonte(p_inicio date, p_fim date)
 RETURNS TABLE(fonte text, investimento numeric, leads bigint, cpl numeric, vendas bigint, faturamento numeric, roas numeric)
 LANGUAGE sql
 STABLE
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
      and o.contact_id not in (select contact_id from public.v_contatos_importados)
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
$function$
;

create or replace view public.v_desempenho_uf_mes
as
 WITH marcos AS (
         SELECT ( SELECT dim_pipeline_stages.stage_order
                   FROM public.dim_pipeline_stages
                  WHERE dim_pipeline_stages.stage_name = 'Amostra Digital Enviada'::text) AS ord_mockup
        ), alcance AS (
         SELECT s.opportunity_id,
            max(COALESCE(d_1.stage_order, 0)) AS max_order
           FROM public.ghl_stage_snapshots s
             LEFT JOIN public.dim_pipeline_stages d_1 ON d_1.stage_id = s.stage_id
          GROUP BY s.opportunity_id
        ), meta_uf AS (
         SELECT m_1.uf,
            date_trunc('month'::text, m_1.date::timestamp without time zone)::date AS mes,
            sum(m_1.spend) AS spend,
            sum(m_1.leads) AS leads_meta
           FROM public.meta_insights_daily m_1
          WHERE m_1.uf IS NOT NULL
          GROUP BY m_1.uf, (date_trunc('month'::text, m_1.date::timestamp without time zone))
        ), opp AS (
         SELECT o.id,
            o.contact_id,
            c.uf,
            date_trunc('month'::text, (o.created_at AT TIME ZONE 'America/Sao_Paulo'::text))::date AS mes,
            GREATEST(COALESCE(a.max_order, 0), COALESCE(dcur.stage_order, 0)) AS max_order,
            o.created_at
           FROM public.ghl_opportunities o
             JOIN public.ghl_contacts c ON c.id = o.contact_id
             LEFT JOIN alcance a ON a.opportunity_id = o.id
             LEFT JOIN public.dim_pipeline_stages dcur ON dcur.stage_id = o.stage_id
          WHERE c.uf IS NOT NULL AND NOT (o.contact_id IN ( SELECT v_contatos_importados.contact_id
                   FROM public.v_contatos_importados))
        ), leads_uf AS (
         SELECT opp.uf,
            opp.mes,
            count(*) AS leads_ghl
           FROM opp
          GROUP BY opp.uf, opp.mes
        ), legado_uf AS (
         SELECT opp.uf,
            opp.mes,
            count(*) FILTER (WHERE opp.max_order >= m_1.ord_mockup) AS mockups_legado
           FROM opp,
            marcos m_1
          WHERE (opp.created_at AT TIME ZONE 'America/Sao_Paulo'::text)::date < '2026-07-16'::date
          GROUP BY opp.uf, opp.mes
        ), webhook_uf AS (
         SELECT upper(NULLIF(e.raw_payload ->> 'Estado'::text, ''::text))::character(2) AS uf,
            date_trunc('month'::text, (e.received_at AT TIME ZONE 'America/Sao_Paulo'::text))::date AS mes,
            count(*) AS mockups_webhook
           FROM public.ghl_funnel_events e
          WHERE e.stage_slug = 'solicitoumockupoficial'::text AND (e.received_at AT TIME ZONE 'America/Sao_Paulo'::text)::date >= '2026-07-16'::date AND length(upper(NULLIF(e.raw_payload ->> 'Estado'::text, ''::text))) = 2 AND NOT (e.contact_id IN ( SELECT v_contatos_importados.contact_id
                   FROM public.v_contatos_importados))
          GROUP BY (upper(NULLIF(e.raw_payload ->> 'Estado'::text, ''::text))::character(2)), (date_trunc('month'::text, (e.received_at AT TIME ZONE 'America/Sao_Paulo'::text))::date)
        ), ghl_uf AS (
         SELECT COALESCE(l.uf, lu.uf, wu.uf) AS uf,
            COALESCE(l.mes, lu.mes, wu.mes) AS mes,
            COALESCE(l.leads_ghl, 0::bigint) AS leads_ghl,
            COALESCE(lu.mockups_legado, 0::bigint) + COALESCE(wu.mockups_webhook, 0::bigint) AS mockups
           FROM leads_uf l
             FULL JOIN legado_uf lu ON lu.uf = l.uf AND lu.mes = l.mes
             FULL JOIN webhook_uf wu ON wu.uf = COALESCE(l.uf, lu.uf) AND wu.mes = COALESCE(l.mes, lu.mes)
        ), vendas_uf AS (
         SELECT p.uf,
            date_trunc('month'::text, p.dia_venda::timestamp without time zone)::date AS mes,
            count(*) FILTER (WHERE p.monetary_value > 0::numeric) AS vendas,
            COALESCE(sum(p.monetary_value), 0::numeric) AS faturamento
           FROM public.v_pedidos_ganhos p
          WHERE p.uf IS NOT NULL AND p.dia_venda >= public.meta_inicio_coleta()
          GROUP BY p.uf, (date_trunc('month'::text, p.dia_venda::timestamp without time zone)::date)
        )
 SELECT COALESCE(m.uf, g.uf, ve.uf) AS uf,
    d.region_group,
    COALESCE(m.mes, g.mes, ve.mes) AS mes,
    public.estacao_do_mes(EXTRACT(month FROM COALESCE(m.mes, g.mes, ve.mes))::integer) AS estacao,
    COALESCE(m.spend, 0::numeric) AS spend,
    COALESCE(m.leads_meta, 0::numeric) AS leads_meta,
    COALESCE(g.leads_ghl, 0::bigint) AS leads_ghl,
    COALESCE(g.mockups, 0::bigint) AS mockups,
    COALESCE(ve.vendas, 0::bigint) AS vendas,
    COALESCE(ve.faturamento, 0::numeric) AS faturamento
   FROM meta_uf m
     FULL JOIN ghl_uf g ON g.uf = m.uf AND g.mes = m.mes
     FULL JOIN vendas_uf ve ON ve.uf = COALESCE(m.uf, g.uf) AND ve.mes = COALESCE(m.mes, g.mes)
     LEFT JOIN public.dim_region_group d ON d.uf = COALESCE(m.uf, g.uf, ve.uf);

create or replace view public.v_leads_sem_venda
as
 WITH frios AS (
         SELECT c.ad_id,
            count(DISTINCT o.id) AS qtd_leads_frios
           FROM public.ghl_opportunities o
             JOIN public.ghl_contacts c ON c.id = o.contact_id
          WHERE c.ad_id IS NOT NULL AND c.ad_id <> ''::text AND o.created_at < (now() - '35 days'::interval) AND NOT (o.contact_id IN ( SELECT v_contatos_importados.contact_id
                   FROM public.v_contatos_importados)) AND NOT (EXISTS ( SELECT 1
                   FROM public.v_vendas v
                  WHERE v.contact_id = c.id AND v.monetary_value > 0::numeric))
          GROUP BY c.ad_id
        ), spend AS (
         SELECT m.ad_id,
            max(m.ad_name) AS ad_name,
            max(m.campaign_name) AS campaign_name,
            sum(m.spend) AS spend_total
           FROM public.meta_insights_daily m
          GROUP BY m.ad_id
        )
 SELECT f.ad_id,
    s.ad_name,
    s.campaign_name,
    f.qtd_leads_frios,
    COALESCE(s.spend_total, 0::numeric) AS spend,
        CASE
            WHEN f.qtd_leads_frios > 0 THEN round(COALESCE(s.spend_total, 0::numeric) / f.qtd_leads_frios::numeric, 2)
            ELSE NULL::numeric
        END AS custo_por_lead_frio
   FROM frios f
     LEFT JOIN spend s ON s.ad_id = f.ad_id
  ORDER BY (COALESCE(s.spend_total, 0::numeric)) DESC;

create or replace view public.v_utm_sem_match
as
 SELECT utm_content,
    max(utm_campaign) AS utm_campaign,
    max(utm_source) AS utm_source,
    count(*) AS qtd_contatos,
    max(created_at) AS ultimo_contato
   FROM public.ghl_contacts c
  WHERE utm_content ~ '^[0-9]{10,}$'::text AND NOT (EXISTS ( SELECT 1
           FROM public.meta_insights_daily m
          WHERE m.ad_id = c.utm_content)) AND NOT (EXISTS ( SELECT 1
           FROM public.meta_ad_attributes a
          WHERE a.ad_id = c.utm_content)) AND NOT (id IN ( SELECT v_contatos_importados.contact_id
           FROM public.v_contatos_importados))
  GROUP BY utm_content
  ORDER BY (count(*)) DESC;

CREATE OR REPLACE FUNCTION public.reconciliacao_meta_ghl(p_inicio date, p_fim date)
 RETURNS TABLE(checagem text, meta_marketing numeric, referencia numeric, diferenca numeric, ok boolean, detalhe text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_ini date := greatest(p_inicio, public.meta_inicio_coleta());
  k jsonb := public._kpis_periodo(v_ini, p_fim);
  s_inv numeric; s_fat numeric;
  f_fat numeric; f_leads numeric; f_vendas numeric;
  a_fat numeric; a_vendas numeric; a_inv numeric;
  d_fat numeric; d_det text;
  r_fat numeric; r_ref numeric;
  sp_lista numeric;
begin
  select sum(investimento), sum(faturamento) into s_inv, s_fat from public.get_serie_diaria(v_ini, p_fim);
  select sum(faturamento), sum(leads), sum(vendas) into f_fat, f_leads, f_vendas from public.get_desempenho_fonte(v_ini, p_fim);
  select sum(faturamento), sum(vendas), sum(spend_total) into a_fat, a_vendas, a_inv from public.get_funnel_por_anuncio(v_ini, p_fim);
  select count(*) into sp_lista from public.v_vendas_sem_pares where dia_venda between v_ini and p_fim;

  with dash as (
    select d.deal_id as id, d.value / 100.0 as valor
    from public.deals_cache d
    where d.source_system = 'ghl' and d.sync_status = 'synced' and d.status = 'won'
      and d.closing_date is not null
      and (d.closing_date at time zone 'UTC')::date between v_ini and p_fim
  ),
  meta as (
    select p.id, p.monetary_value as valor
    from public.v_pedidos_ganhos p
    where p.dia_venda between v_ini and p_fim
  ),
  so_um_lado as (
    select coalesce(m.id, d.id) as id,
      case when m.id is null then 'só no /dashboard' when d.id is null then 'só no Meta' else 'valor diferente' end as onde,
      coalesce(m.valor, 0) - coalesce(d.valor, 0) as dif
    from meta m
    full join dash d on d.id = m.id
    where m.id is null or d.id is null or m.valor <> d.valor
  )
  select (select sum(valor) from dash),
         string_agg(id || ' (' || onde || ', ' || round(dif, 2) || ')', '; ' order by abs(dif) desc)
    into d_fat, d_det
  from so_um_lado;

  select sum(faturamento) into r_fat from public.v_desempenho_uf_mes;
  select sum(monetary_value) into r_ref from public.v_pedidos_ganhos
  where uf is not null and dia_venda >= public.meta_inicio_coleta();

  return query values
    ('Faturamento: cards x gráfico diário', (k->>'faturamento')::numeric, s_fat, (k->>'faturamento')::numeric - s_fat, (k->>'faturamento')::numeric = s_fat, null::text),
    ('Investimento: cards x gráfico diário', (k->>'spend')::numeric, s_inv, (k->>'spend')::numeric - s_inv, (k->>'spend')::numeric = s_inv, null),
    ('Faturamento: cards x Performance por fonte', (k->>'faturamento')::numeric, f_fat, (k->>'faturamento')::numeric - f_fat, (k->>'faturamento')::numeric = f_fat, null),
    ('Leads: cards x Performance por fonte', (k->>'leads')::numeric, f_leads, (k->>'leads')::numeric - f_leads, (k->>'leads')::numeric = f_leads, null),
    ('Pedidos: cards x Performance por fonte', (k->>'vendas')::numeric, f_vendas, (k->>'vendas')::numeric - f_vendas, (k->>'vendas')::numeric = f_vendas, null),
    ('Faturamento Meta: cards x soma da aba Anúncios', (k->>'faturamento_meta')::numeric, a_fat, (k->>'faturamento_meta')::numeric - a_fat, (k->>'faturamento_meta')::numeric = a_fat, null),
    ('Pedidos Meta: cards x soma da aba Anúncios', (k->>'vendas_meta')::numeric, a_vendas, (k->>'vendas_meta')::numeric - a_vendas, (k->>'vendas_meta')::numeric = a_vendas, null),
    ('Investimento: cards x soma da aba Anúncios', (k->>'spend')::numeric, a_inv, (k->>'spend')::numeric - a_inv, (k->>'spend')::numeric = a_inv, null),
    ('Vendas sem pares: card x lista', (k->>'vendas_sem_pares')::numeric, sp_lista, (k->>'vendas_sem_pares')::numeric - sp_lista, (k->>'vendas_sem_pares')::numeric = sp_lista, null),
    ('Faturamento: Meta Marketing x /dashboard', (k->>'faturamento')::numeric, coalesce(d_fat, 0), (k->>'faturamento')::numeric - coalesce(d_fat, 0), d_det is null, d_det),
    ('Regiões (desde a coleta): soma dos estados x pedidos com estado', r_fat, r_ref, r_fat - r_ref, r_fat = r_ref, null);
end;
$function$
;
