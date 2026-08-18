-- ============================================================
-- Criado em 2026-08-18
--
-- Usuário reportou: "marquei negócios como ganho ontem com valores e
-- o faturamento aparece zerado". Investigação achou 6 vendas reais
-- (R$7.965,34) escondidas por v_contatos_importados, através de 2
-- dos seus 4 ramos de exclusão:
--   - Ramo "tag contém import": contato tem a tag `import-03-08-26`
--     (herdada de quando o registro original migrou do CRM antigo),
--     mas fez uma venda de verdade, processada individualmente,
--     bem depois da migração.
--   - Ramo "órfão + dia de rajada": o contact_id nunca chegou a
--     sincronizar em ghl_contacts (bug de fila -- ver
--     `runLinkedContacts`, ordena por oportunidade mais recente, mas
--     esses 4 tinham a oportunidade ORIGINAL criada no lote de 03/08,
--     então ficavam sempre atrás dos ~12k órfãos mortos da fila,
--     mesmo tendo sido vendidos de verdade dias/semanas depois).
--
-- Sinal usado pra distinguir venda real de venda fake do lote:
-- comparar a data de CRIAÇÃO das oportunidades (usada hoje pros 2
-- ramos acima) com a data em que o negócio foi GANHO (won_at). No
-- lote fake, os dois batem exatamente no mesmo dia de rajada (a
-- migração já injeta o negócio direto como "won", com timestamp
-- fabricado). Numa venda real, mesmo que a oportunidade original
-- tenha sido criada/migrada num dia de rajada, o won_at de uma venda
-- de verdade cai em outro dia, bem depois, processado individualmente
-- pela equipe.
--
-- Verificado ao vivo antes do fix: 204 negócios tagueados "import"
-- foram ganhos NO PRÓPRIO dia de rajada (R$407.626,64 -- claramente
-- fake, mesmo lote já documentado). Só 2 foram ganhos em dia normal
-- (R$2.889,72 -- reais). Do lado órfão: 711 fake (R$1.262.603,88,
-- ganhos no dia de rajada) vs 4 reais (R$4.075,62, ganhos em dias
-- normais espalhados). Fix não reabre o buraco de R$1,26 milhão já
-- corrigido em 2026-08-10 (v_contatos_importados_inclui_orfaos_sem_tag)
-- -- só libera quem tem evidência forte e específica de venda
-- individual de verdade.
-- ============================================================

create or replace view public.v_contatos_importados as
with dias_rajada as (
  select (created_at at time zone 'America/Sao_Paulo')::date as dia
  from ghl_opportunities
  group by 1
  having count(*) > 1000
),
candidatos as (
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
  select o.contact_id
  from ghl_opportunities o
  left join ghl_contacts c on c.id = o.contact_id
  join dias_rajada on dias_rajada.dia = (o.created_at at time zone 'America/Sao_Paulo')::date
  where c.id is null
  union
  select o.contact_id
  from ghl_opportunities o
  where (o.raw ->> 'source') ilike '%activecampaign migration%'
),
venda_real_fora_da_rajada as (
  -- Contato com pelo menos 1 negócio GANHO, com valor, cujo won_at
  -- NÃO cai em dia de rajada -- sinal forte de venda processada
  -- individualmente, não parte do lote fake em massa.
  select distinct o.contact_id
  from ghl_opportunities o
  where o.status = 'won'
    and o.monetary_value > 0
    and (o.won_at at time zone 'America/Sao_Paulo')::date not in (select dia from dias_rajada)
)
select contact_id
from candidatos
where contact_id not in (select contact_id from venda_real_fora_da_rajada);

comment on view public.v_contatos_importados is
  'Contatos de lotes de migração do CRM antigo (tag/órfão em dia de '
  'rajada/source ActiveCampaign) -- excluídos das métricas de negócio '
  'por padrão, EXCETO quando têm pelo menos 1 venda real (won_at fora '
  'do dia de rajada), sinal de que o contato voltou a ter atividade '
  'de verdade depois da migração e não deve ficar invisível pra sempre.';
