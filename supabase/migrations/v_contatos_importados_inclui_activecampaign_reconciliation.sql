-- ============================================================
-- Criado em 2026-08-12
--
-- Achado a partir do usuário notando que o gráfico "Saúde da atribuição"
-- não refletia os fixes anteriores desta auditoria: a semana de 03/08
-- mostrava 51,6% de "% com UTM" (abaixo do limiar de 80%, disparando o
-- alerta "Atribuição degradada"), mesmo com v_atribuicao_saude já
-- aplicando a exclusão de v_contatos_importados desde 24/07.
--
-- Causa raiz: um 4º lote de migração, diferente dos 3 já tratados
-- (tag "import", órfão+rajada >1000/dia) -- 235 oportunidades
-- ("ActiveCampaign migration (deal N)" + "... reconciliation") criadas
-- num burst de ~90s em 08/08/2026. Pequeno demais pro gatilho de rajada,
-- sem tag "import", e com contato JÁ EXISTENTE em ghl_contacts (não
-- órfão) -- escapava das 3 regras anteriores.
--
-- Sinal usado: campo nativo do GHL raw->>'source' contendo
-- "ActiveCampaign migration" -- mais direto e específico que
-- tag/volume/orfandade, cobre as duas variantes (deal N / reconciliation)
-- automaticamente e qualquer futura.
--
-- Efeito em cascata (todos os consumidores de v_contatos_importados
-- herdam o fix automaticamente, sem precisar tocar em cada um):
-- - v_atribuicao_saude: semana de 03/08 "% com UTM" 51,6% -> 86,5%
--   (acima do limiar de 80%, alerta "Atribuição degradada" deve sumir)
-- - v_vendas_sem_pares: 4 -> 1 negócio "sem pares" (3 dos 4 eram desse
--   mesmo lote -- eram vendas fantasma migradas, não negócios reais
--   com dado faltando)
-- ============================================================

create or replace view public.v_contatos_importados
with (security_invoker = true) as
select distinct contact_id
from (
  select c.id as contact_id
  from ghl_contacts c
  where exists (
    select 1 from jsonb_array_elements_text(coalesce(c.raw -> 'tags', '[]'::jsonb)) t(value)
    where t.value ilike '%import%'
  )
  union
  select e.contact_id
  from ghl_funnel_events e
  where exists (
    select 1 from unnest(e.tags) t(t)
    where t.t ilike '%import%'
  )
  union
  -- lote de 12k+ oportunidades de 03/08/2026: órfãs (contato nunca sincronizado)
  -- e concentradas num dia de volume anômalo (>1000/dia), sem tag "import".
  select o.contact_id
  from ghl_opportunities o
  left join ghl_contacts c on c.id = o.contact_id
  join (
    select (created_at at time zone 'America/Sao_Paulo')::date as dia
    from ghl_opportunities
    group by 1
    having count(*) > 1000
  ) dias_rajada on dias_rajada.dia = (o.created_at at time zone 'America/Sao_Paulo')::date
  where c.id is null
  union
  -- lote de 08/08/2026: 235 oportunidades migradas do ActiveCampaign num
  -- burst de ~90s ("ActiveCampaign migration (deal N)" / "... reconciliation"),
  -- pequeno demais pro gatilho de rajada e com contato já existente (não órfão)
  -- -- sinal estrutural direto no campo source em vez de tag/volume/orfandade.
  select o.contact_id
  from ghl_opportunities o
  where o.raw->>'source' ilike '%activecampaign migration%'
) x;
