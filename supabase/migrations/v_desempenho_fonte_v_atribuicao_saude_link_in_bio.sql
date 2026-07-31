-- ============================================================
-- Criado em 2026-07-31 (aplicado no Dashboard-v2 via MCP)
--
-- Bug: contato com ad_id = 'link_in_bio' (tag manual de clique no
-- link da bio do Instagram, ver migration v_atribuicao_saude_bio_conta_
-- como_meta) só era reconhecido como tráfego de perfil Meta quando o
-- utm_source/source TAMBÉM mencionava facebook/instagram/meta. Achado
-- via caso real: Juliane Visentin de Lima Hanel (contact_id
-- i9UZxHmsH91DhOHRZLzH, R$1.293,84 de faturamento) tem ad_id=
-- 'link_in_bio' mas utm_source='CadastroManual' (cadastro feito
-- manualmente pela equipe, não pelo clique automático que normalmente
-- preenche utm_source='Instagram') -- caiu em "Outros" em vez de
-- "Instagram/Facebook (perfil)". O valor do próprio ad_id já é o sinal
-- definitivo (33/33 ocorrências de 'link_in_bio' no banco são
-- legitimamente clique no link da bio), então passa a valer sozinho,
-- sem depender do utm_source confirmar de novo.
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
agg as (
  select
    ct.fonte,
    count(*) as leads,
    count(distinct v.contact_id) as vendas,
    coalesce(sum(v.monetary_value), 0) as faturamento
  from contatos ct
  left join v_vendas v on v.contact_id = ct.id
  group by ct.fonte
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

create or replace view public.v_atribuicao_saude
with (security_invoker = true) as
select
  date_trunc('week', o.created_at at time zone 'America/Sao_Paulo')::date as semana,
  count(distinct c.id) as contatos,
  count(distinct c.id) filter (where c.utm_content is not null and c.utm_content <> '') as com_utm,
  round(100.0 * count(distinct c.id) filter (where c.utm_content is not null and c.utm_content <> '')::numeric
    / nullif(count(distinct c.id), 0)::numeric, 1) as pct_com_utm,
  count(distinct c.id) filter (
    where c.utm_content is not null and c.utm_content <> ''
    and (c.ad_id ~ '^[0-9]{10,}$'
      or c.ad_id = 'link_in_bio'
      or lower(coalesce(nullif(c.utm_source, ''), nullif(c.source, ''), '')) ~ '(facebook|instagram|meta|^fb$)')
  ) as com_match_meta,
  round(100.0 * count(distinct c.id) filter (
    where c.utm_content is not null and c.utm_content <> ''
    and (c.ad_id ~ '^[0-9]{10,}$'
      or c.ad_id = 'link_in_bio'
      or lower(coalesce(nullif(c.utm_source, ''), nullif(c.source, ''), '')) ~ '(facebook|instagram|meta|^fb$)')
  )::numeric / nullif(count(distinct c.id) filter (where c.utm_content is not null and c.utm_content <> ''), 0)::numeric, 1) as pct_match_meta,
  count(distinct c.id) filter (where c.ad_id ~ '^[0-9]{10,}$') as com_ad_especifico,
  round(100.0 * count(distinct c.id) filter (where c.ad_id ~ '^[0-9]{10,}$')::numeric
    / nullif(count(distinct c.id) filter (
      where c.utm_content is not null and c.utm_content <> ''
      and (c.ad_id ~ '^[0-9]{10,}$'
        or c.ad_id = 'link_in_bio'
        or lower(coalesce(nullif(c.utm_source, ''), nullif(c.source, ''), '')) ~ '(facebook|instagram|meta|^fb$)')
    ), 0)::numeric, 1) as pct_ad_especifico
from ghl_opportunities o
join ghl_contacts c on c.id = o.contact_id
group by (date_trunc('week', o.created_at at time zone 'America/Sao_Paulo')::date)
order by (date_trunc('week', o.created_at at time zone 'America/Sao_Paulo')::date) desc;
