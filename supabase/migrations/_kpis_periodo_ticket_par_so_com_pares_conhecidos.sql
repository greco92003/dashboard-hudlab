-- ============================================================
-- Criado em 2026-08-10 (aplicado no Dashboard-v2 via MCP)
--
-- Achado ao investigar "ticket médio por par não bate" (usuário
-- esperava ~R$54, sistema mostrava R$743,40 nos últimos 7 dias):
-- ticket_medio_par dividia o FATURAMENTO TOTAL (todas as vendas) pela
-- soma de qty_pares (que ignora silenciosamente vendas sem esse campo
-- preenchido) -- numerador e denominador vinham de conjuntos
-- diferentes de vendas. No período de 7 dias, 10 de 11 vendas não
-- tinham qty_pares preenchido (nem na oportunidade, nem no contato,
-- nem no evento de mockup) -- provavelmente vendas criadas
-- manualmente (CadastroManual) não passam pelo fluxo de mockup que
-- normalmente captura essa quantidade.
--
-- Fix: ticket_medio_par agora usa só o faturamento das vendas que TÊM
-- qty_pares preenchido, comparando maçã com maçã. custo_por_par
-- continua como estava (investimento total / pares totais) -- não tem
-- como filtrar o lado do investimento por venda individual.
--
-- Resultado (90 dias): R$235,57/par -> R$74,68/par. Ainda não bate
-- exatamente com o ~R$54 esperado -- causa provável é a lacuna de
-- dados em si (só 7 de 18 vendas no período têm qty_pares preenchido),
-- não um problema de cálculo; recomendação pro usuário é garantir que
-- a equipe preencha "Quantidade de Pares" ao fechar negócios,
-- especialmente os criados manualmente.
-- ============================================================

CREATE OR REPLACE FUNCTION public._kpis_periodo(p_inicio date, p_fim date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_spend numeric;
  v_impressoes bigint;
  v_cliques bigint;
  v_leads bigint;
  v_vendas bigint;
  v_faturamento numeric;
  v_faturamento_com_pares numeric;
  v_pares bigint;
  v_mockups bigint;
  v_mockups_legado bigint;
  v_mockups_webhook bigint;
  v_ord_mockup int;
begin
  select coalesce(sum(spend), 0), coalesce(sum(impressions), 0), coalesce(sum(clicks), 0)
    into v_spend, v_impressoes, v_cliques
  from public.meta_insights_daily
  where date between p_inicio and p_fim;

  select stage_order into v_ord_mockup
  from public.dim_pipeline_stages where stage_name = 'Amostra Digital Enviada';

  select count(*) into v_leads
  from public.ghl_opportunities o
  where (o.created_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
    and o.contact_id not in (select contact_id from public.v_contatos_importados);

  select count(*) into v_mockups_legado
  from public.ghl_opportunities o
  where (o.created_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
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
  where (e.received_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
    and (e.received_at at time zone 'America/Sao_Paulo')::date >= date '2026-07-16'
    and e.contact_id not in (select contact_id from public.v_contatos_importados);

  v_mockups := coalesce(v_mockups_legado, 0) + coalesce(v_mockups_webhook, 0);

  select
    count(distinct v.contact_id),
    coalesce(sum(v.monetary_value), 0),
    sum(v.qty_pares),
    coalesce(sum(v.monetary_value) filter (where v.qty_pares is not null), 0)
    into v_vendas, v_faturamento, v_pares, v_faturamento_com_pares
  from public.v_vendas v
  where (v.venda_em at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim;

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
    'ticket_medio_par', case when v_pares > 0 then round(v_faturamento_com_pares / v_pares, 2) end,
    'custo_por_par', case when v_pares > 0 then round(v_spend / v_pares, 2) end,
    'mockups', v_mockups,
    'custo_por_mockup', case when v_mockups > 0 then round(v_spend / v_mockups, 2) end
  );
end;
$function$;
