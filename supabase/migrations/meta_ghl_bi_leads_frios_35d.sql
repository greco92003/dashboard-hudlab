-- ============================================================
-- Leads frios: threshold 35 dias + data de referência corrigida
-- (já aplicado no projeto Dashboard-v2 via MCP em 2026-07-21,
--  revisado na mesma data na migration
--  meta_ghl_bi_leads_frios_data_oportunidade)
--
-- Lead time real da Hud Lab é de 35 dias (produto personalizado
-- sob encomenda). Marcar como "frio" com 14 dias gerava falso
-- positivo — o lead ainda estava dentro do ciclo normal de venda.
--
-- BUG CORRIGIDO: a primeira versão usava ghl_contacts.created_at
-- (dateAdded do contato no GHL, que pode carregar histórico bem
-- anterior à oportunidade atual — chega a 04/2026) para calcular a
-- idade do lead. O correto é usar ghl_opportunities.created_at, que
-- está escopado desde 01/07/2026 (~21 dias de coleta no momento
-- desta correção). Com lead time de 35 dias, é esperado e correto
-- que o widget fique vazio até as oportunidades mais antigas
-- passarem dessa marca (~05/08/2026).
-- ============================================================

create or replace view public.v_leads_sem_venda
with (security_invoker = true) as
with frios as (
  select c.ad_id, count(distinct o.id) as qtd_leads_frios
  from public.ghl_opportunities o
  join public.ghl_contacts c on c.id = o.contact_id
  where c.ad_id is not null and c.ad_id <> ''
    and o.created_at < now() - interval '35 days'
    and not exists (select 1 from public.v_vendas v where v.contact_id = c.id)
  group by c.ad_id
),
spend as (
  select ad_id, max(ad_name) as ad_name, max(campaign_name) as campaign_name,
         sum(spend) as spend_total
  from public.meta_insights_daily
  group by ad_id
)
select
  f.ad_id, s.ad_name, s.campaign_name, f.qtd_leads_frios,
  coalesce(s.spend_total, 0) as spend,
  case when f.qtd_leads_frios > 0
       then round(coalesce(s.spend_total, 0) / f.qtd_leads_frios, 2) end as custo_por_lead_frio
from frios f
left join spend s on s.ad_id = f.ad_id
order by coalesce(s.spend_total, 0) desc;
