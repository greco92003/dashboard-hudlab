-- 2026-09-30 (aplicada em produção pelo conector do Supabase).
--
-- (1) Uma base só de faturamento: o Meta Marketing passa a somar do
-- deals_cache, a mesma tabela, regra de ganho e data do /dashboard, do
-- gráfico mensal e do Live Dashboard. Antes lia ghl_opportunities, outra
-- cópia do GHL sincronizada em outro horário: em 30/09 sete vendas do dia
-- (R$ 12,4 mil) estavam ganhas no deals_cache e "abertas" em ghl_opportunities.

-- Mesma regra de lib/ghl/pipelines.ts (isGhlWonDeal).
create or replace function public.ghl_deal_ganho(p_status text, p_pipeline_id text, p_stage_id text, p_valor numeric)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(coalesce(p_status, '')) in ('won', '1')
      or (p_pipeline_id = 'ShSCF8BTLIdKHAjq491X'
          and p_stage_id in ('49a81bf5-6148-4074-87d1-bc0aaed13a00', '7fb18489-0d66-4591-be25-5146e669b4e8')
          and coalesce(p_valor, 0) > 0)
$$;

-- closing_date é meia-noite UTC do dia da venda (ver lib/ghl/funnel-sales.ts).
create index if not exists idx_deals_cache_ghl_dia_venda
  on public.deals_cache (((closing_date at time zone 'UTC')::date))
  where source_system = 'ghl' and sync_status = 'synced';

create or replace view public.v_pedidos_ganhos
with (security_invoker = true)
as
select
  d.deal_id as id,
  d.contact_id,
  (d.value / 100.0)::numeric(12,2) as monetary_value,
  coalesce(
    case when btrim(d."quantidade-de-pares") ~ '^[0-9]{1,9}$' then btrim(d."quantidade-de-pares")::int end,
    c.qty_pares
  ) as qty_pares,
  (d.closing_date at time zone 'UTC')::date as dia_venda,
  a.chave_meta,
  coalesce(a.fonte, 'Outros') as fonte,
  c.uf
from public.deals_cache d
left join public.ghl_contacts c on c.id = d.contact_id
left join public.mv_contato_atribuicao a on a.contact_id = d.contact_id
where d.source_system = 'ghl'
  and d.sync_status = 'synced'
  and d.closing_date is not null
  and public.ghl_deal_ganho(d.status, d.pipeline_id, d.stage_id, d.value);

create or replace view public.v_vendas_sem_pares as
select
  p.id as opportunity_id,
  p.contact_id,
  c.first_name,
  c.last_name,
  c.email,
  c.phone,
  p.monetary_value,
  coalesce(o.won_at, o.updated_at) as venda_em,
  p.dia_venda
from public.v_pedidos_ganhos p
left join public.ghl_opportunities o on o.id = p.id
left join public.ghl_contacts c on c.id = p.contact_id
where p.qty_pares is null and p.monetary_value > 0
order by p.dia_venda desc;

-- (2) Desempenho: as funções de relatório rodavam com as regras de acesso
-- por linha (RLS) do usuário logado, e com RLS o banco não usa os índices de
-- data (a conversão de fuso não é "leakproof") -- get_desempenho_fonte ia de
-- 0,02 s para 3,7 s e, com a página inteira em paralelo, estourava os 60 s.
-- Passam a rodar com permissão do dono. O acesso fica igual ao de hoje: só
-- usuário logado ou service_role (anon perde a execução). A trava de
-- "usuário aprovado" entra junto com a fase 2 (segurança).
do $$
declare f text;
begin
  foreach f in array array[
    'public._kpis_periodo(date,date)',
    'public.get_resumo_periodo(date,date)',
    'public.get_funnel_por_anuncio(date,date)',
    'public.get_serie_diaria(date,date)',
    'public.get_desempenho_fonte(date,date)',
    'public.get_funil_etapas(date,date)',
    'public.reconciliacao_meta_ghl(date,date)'
  ] loop
    execute format('alter function %s security definer', f);
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

alter view public.v_atribuicao_saude set (security_invoker = false);

-- Nome dos pipelines para o funil (a tela lia 500 oportunidades para isso).
create or replace function public.get_nomes_pipelines()
returns table(pipeline_id text, pipeline_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (o.pipeline_id) o.pipeline_id, o.pipeline_name
  from public.ghl_opportunities o
  where o.pipeline_name is not null
  order by o.pipeline_id, o.synced_at desc
$$;
revoke execute on function public.get_nomes_pipelines() from public, anon;
grant execute on function public.get_nomes_pipelines() to authenticated, service_role;
