-- A checagem de Regiões passa a somar get_desempenho_uf() (o que a tela usa
-- desde o PR #32) em vez de v_desempenho_uf_mes, que vai ser removida. Função
-- plpgsql não registra dependência da view, então o drop passaria e quebraria
-- esta função em silêncio. Resto da função idêntico.
-- Conferido: a checagem de Regiões deu R$ 303.133,47 dos dois lados antes e
-- depois da troca, e as 11 checagens seguem ok.
CREATE OR REPLACE FUNCTION public.reconciliacao_meta_ghl(p_inicio date, p_fim date)
 RETURNS TABLE(checagem text, meta_marketing numeric, referencia numeric, diferenca numeric, ok boolean, detalhe text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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

  select sum(faturamento) into r_fat from public.get_desempenho_uf();
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
$function$;

revoke all on function public.reconciliacao_meta_ghl(date, date) from public, anon, authenticated;
grant execute on function public.reconciliacao_meta_ghl(date, date) to service_role;
