-- ============================================================
-- Criado em 2026-08-10 (aplicado no Dashboard-v2 via MCP)
--
-- Correção do fix anterior (v_contatos_importados_inclui_orfaos_sem_tag):
-- o sinal "contato não sincronizado + oportunidade com mais de 2 dias"
-- era grande demais -- o atraso normal de sincronização de contato pode
-- passar de 2 dias sob a carga atual (o próprio lote de 12k+ importados
-- competindo pela fila de sync), então a regra estava excluindo
-- CONTATOS REAIS E RECENTES por engano.
--
-- Achado ao investigar "solicitações de mockup não bate" (usuário
-- relatou 127 nos últimos 7 dias, sistema mostrava só 53): 129 eventos
-- reais de mockup existiam no período, mas 75 estavam sendo excluídos
-- por engano pela regra de 2 dias -- contatos com oportunidade criada
-- em 06-08/08, só ainda não sincronizados (backlog, não são do lote
-- importado).
--
-- Sinal novo, muito mais preciso: em vez de medir tempo decorrido,
-- identifica o(s) DIA(S) com volume anômalo de criação de oportunidades
-- (>1000 num único dia -- qualquer dia normal do histórico tem no
-- máximo ~220, mesmo com atraso de sync acumulado) e só exclui
-- contatos não sincronizados cuja oportunidade caiu EXATAMENTE nesse
-- dia. Não depende de quanto tempo já passou, então nunca vai excluir
-- um contato novo só porque o sync está atrasado -- e continua
-- generalizando pra qualquer lote de importação futuro sem tag, desde
-- que também tenha a assinatura de rajada (muitas oportunidades no
-- mesmo dia).
--
-- Resultado: das 75 exclusões erradas, sobraram só 7 (contatos que
-- realmente têm uma oportunidade criada dentro do dia de rajada, caso
-- ambíguo aceitável) -- eventos de mockup no período foram de 53 pra
-- 122 (usuário esperava 127).
-- ============================================================

create or replace view public.v_contatos_importados
with (security_invoker = true) as
select distinct contact_id from (
  select c.id as contact_id
  from public.ghl_contacts c
  where exists (
    select 1 from jsonb_array_elements_text(coalesce(c.raw->'tags', '[]'::jsonb)) t
    where t ilike '%import%'
  )
  union
  select e.contact_id
  from public.ghl_funnel_events e
  where exists (select 1 from unnest(e.tags) t where t ilike '%import%')
  union
  select o.contact_id
  from public.ghl_opportunities o
  left join public.ghl_contacts c on c.id = o.contact_id
  join (
    select (created_at at time zone 'America/Sao_Paulo')::date as dia
    from public.ghl_opportunities
    group by 1
    having count(*) > 1000
  ) dias_rajada on dias_rajada.dia = (o.created_at at time zone 'America/Sao_Paulo')::date
  where c.id is null
) x;
