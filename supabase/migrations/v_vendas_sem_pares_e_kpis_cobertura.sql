-- ============================================================
-- Criado em 2026-08-10 (aplicado no Dashboard-v2 via MCP)
--
-- Pedido do usuário: em vez de "resolver" o ticket médio/par com uma
-- amostra parcial (só vendas com qty_pares preenchido -- viés de
-- seleção real, a amostra pode não representar o todo), apontar
-- explicitamente QUAIS negócios estão sem esse campo, pra equipe
-- corrigir na origem (GHL).
--
-- Nova view v_vendas_sem_pares: lista as vendas (já excluindo
-- importados) sem qty_pares, com nome do contato pra ação direta.
-- _kpis_periodo ganha um contador "vendas_sem_pares" pro frontend
-- mostrar a cobertura ao lado do ticket médio/pares vendidos.
-- ============================================================

create or replace view public.v_vendas_sem_pares
with (security_invoker = true) as
select
  v.id as opportunity_id,
  v.contact_id,
  c.first_name,
  c.last_name,
  c.email,
  c.phone,
  v.monetary_value,
  v.venda_em
from public.v_vendas v
left join public.ghl_contacts c on c.id = v.contact_id
where v.qty_pares is null
order by v.venda_em desc;

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
  v_vendas_sem_pares bigint;
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
    coalesce(sum(v.monetary_value) filter (where v.qty_pares is not null), 0),
    count(*) filter (where v.qty_pares is null)
    into v_vendas, v_faturamento, v_pares, v_faturamento_com_pares, v_vendas_sem_pares
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
    'vendas_sem_pares', v_vendas_sem_pares,
    'mockups', v_mockups,
    'custo_por_mockup', case when v_mockups > 0 then round(v_spend / v_mockups, 2) end
  );
end;
$function$;
