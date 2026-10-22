-- ============================================================
-- Conversão por criativo (2026-10-22)
--
-- Substitui "Leads frios" na aba Anúncios. Aquela tabela contava leads de
-- mais de 35 dias sem venda e dividia o gasto total por eles: crescia com o
-- volume e invertia a leitura (GrecoClassico, 4,6% de conversão, parecia
-- pior que JornalNegocioV2.7, 1,7%).
--
-- Aqui: leads que chegaram por cada anúncio entre p_inicio e p_fim, quantos
-- compraram depois de virar lead, quanto faturaram e quanto o anúncio gastou
-- nesses mesmos dias. A tela passa uma janela de leads que já completaram 35
-- dias (lead time do produto) -- ver janelaLeadsMaduros em
-- app/meta-marketing/lib.ts.
--
-- Lead = contato com anúncio na atribuição (mv_contato_atribuicao, chave
-- numérica; bio de campanha fica de fora, não é criativo), pela data em que
-- o contato foi criado. Base importada do CRM antigo fica de fora. Venda =
-- v_pedidos_ganhos com valor, a mesma base de faturamento do módulo.
-- ============================================================

create or replace function public.get_conversao_criativos(p_inicio date, p_fim date)
returns table (
  ad_id text,
  ad_name text,
  campaign_name text,
  leads bigint,
  compraram bigint,
  faturamento numeric,
  investimento numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with leads as (
    select
      a.contact_id,
      a.chave_meta as ad_id,
      (c.created_at at time zone 'America/Sao_Paulo')::date as dia_lead
    from public.mv_contato_atribuicao a
    join public.ghl_contacts c on c.id = a.contact_id
    where a.chave_meta ~ '^[0-9]{10,}$'
      and (c.created_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
      and not exists (
        select 1 from public.mv_contatos_importados i where i.contact_id = a.contact_id
      )
  ),
  compras as (
    select l.contact_id, sum(p.monetary_value) as faturamento
    from leads l
    join public.v_pedidos_ganhos p on p.contact_id = l.contact_id
    where p.monetary_value > 0
      and p.dia_venda >= l.dia_lead
    group by l.contact_id
  ),
  por_anuncio as (
    select
      l.ad_id,
      count(*) as leads,
      count(cp.contact_id) as compraram,
      coalesce(sum(cp.faturamento), 0) as faturamento
    from leads l
    left join compras cp using (contact_id)
    group by l.ad_id
  ),
  gasto as (
    select m.ad_id, sum(m.spend) as investimento
    from public.meta_insights_daily m
    where m.date between p_inicio and p_fim
    group by m.ad_id
  ),
  nomes as (
    select m.ad_id, max(m.ad_name) as ad_name, max(m.campaign_name) as campaign_name
    from public.meta_insights_daily m
    group by m.ad_id
  )
  select
    pa.ad_id,
    n.ad_name,
    n.campaign_name,
    pa.leads,
    pa.compraram,
    pa.faturamento,
    coalesce(g.investimento, 0) as investimento
  from por_anuncio pa
  left join gasto g using (ad_id)
  left join nomes n using (ad_id)
  order by pa.leads desc
$$;

-- Mesmo acesso das demais funções de relatório: só a rota
-- /api/meta-marketing/report (usuário aprovado, service_role).
revoke all on function public.get_conversao_criativos(date, date) from public, anon, authenticated;
grant execute on function public.get_conversao_criativos(date, date) to service_role;
