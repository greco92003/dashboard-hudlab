-- ============================================================
-- Criado em 2026-08-04 (aplicado no Dashboard-v2 via MCP)
--
-- Achado: usuário reportou Faturamento (Visão Geral, 7 dias) = R$35.089,68
-- (bate com o GHL), mas a soma da tabela "Performance por fonte" = só
-- R$31.835,28 -- gap de exatos R$3.254,40, uma venda de HOJE
-- (contact_id vck1A9tWNaJzTFlA6D7c) cujo contato ainda não tinha
-- sincronizado em ghl_contacts no momento (sync em fases: opportunities
-- termina antes de contacts, deixando uma janela onde a oportunidade já
-- está "won" mas o contato ainda não existe na nossa tabela).
--
-- Causa raiz: v_desempenho_fonte partia de ghl_contacts pra classificar
-- TANTO leads quanto vendas/faturamento -- uma venda cujo contact_id
-- não tem linha em ghl_contacts (ainda) fica invisível na view inteira,
-- não aparece nem em "Outros". Isso é um problema estrutural, não um
-- erro pontual: qualquer venda no mesmo dia da sincronização do
-- contato pode cair nessa janela.
--
-- Fix: separa a agregação de "leads" (continua exigindo contato
-- sincronizado, faz sentido) da agregação de "vendas/faturamento"
-- (agora parte de v_vendas diretamente, com LEFT JOIN pra ghl_contacts
-- -- contato ainda não sincronizado cai em "Outros" até sincronizar,
-- nunca mais some da soma). Uma vez que o contato sincronizar, a
-- venda migra sozinha da fonte correta na próxima consulta (view
-- normal, não materializada).
-- ============================================================

create or replace view public.v_desempenho_fonte
with (security_invoker = true) as
with contatos as (
  select
    c.id,
    case
      when c.ad_id ~ '^[0-9]{10,}$' then 'Meta Ads'
      when c.ad_id = 'link_in_bio'
        or lower(coalesce(nullif(c.utm_source, ''), nullif(c.source, ''), '')) ~ '(facebook|instagram|meta|^fb$)'
        then 'Instagram/Facebook (perfil)'
      when lower(coalesce(nullif(c.utm_source, ''), nullif(c.source, ''), '')) ~ 'google' then 'Google Ads'
      when lower(coalesce(nullif(c.utm_source, ''), nullif(c.source, ''), '')) ~ '(indica|referral)' then 'Indicação'
      when nullif(lower(nullif(c.utm_source, '')), 'website') is null then 'Orgânico'
      else 'Outros'
    end as fonte
  from ghl_contacts c
),
leads_agg as (
  select fonte, count(*) as leads
  from contatos
  group by fonte
),
vendas_agg as (
  select
    coalesce(ct.fonte, 'Outros') as fonte,
    count(distinct v.contact_id) as vendas,
    coalesce(sum(v.monetary_value), 0) as faturamento
  from v_vendas v
  left join contatos ct on ct.id = v.contact_id
  group by coalesce(ct.fonte, 'Outros')
),
agg as (
  select
    coalesce(l.fonte, v.fonte) as fonte,
    coalesce(l.leads, 0) as leads,
    coalesce(v.vendas, 0) as vendas,
    coalesce(v.faturamento, 0) as faturamento
  from leads_agg l
  full outer join vendas_agg v on v.fonte = l.fonte
),
spend_por_fonte as (
  select 'Meta Ads'::text as fonte, sum(spend) as investimento
  from meta_insights_daily
)
select
  a.fonte,
  s.investimento,
  a.leads,
  case when s.investimento is not null and a.leads > 0
    then round(s.investimento / a.leads::numeric, 2) end as cpl,
  a.vendas,
  a.faturamento,
  case when s.investimento is not null and s.investimento > 0
    then round(a.faturamento / s.investimento, 2) end as roas
from agg a
left join spend_por_fonte s on s.fonte = a.fonte
order by a.faturamento desc;
