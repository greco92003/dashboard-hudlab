-- ============================================================
-- Criado em 2026-08-10 (aplicado no Dashboard-v2 via MCP)
--
-- Achado ao investigar "números desproporcionais" a pedido do usuário:
-- 12.082 oportunidades foram criadas em 03/08/2026 (contra 1-220/dia
-- em qualquer outro dia do dataset) -- migração em massa do histórico
-- de pedidos antigos, SEM a tag "import" usada pelos outros dois lotes
-- já tratados (import-24-07-26, import-03-08-26). 997 delas já estão
-- com status='won', somando R$1.68 milhão -- se não excluídas,
-- qualquer "período" que cruze 03/08 mostra faturamento/vendas
-- absurdamente inflados.
--
-- Sinal de identificação (confirmado ao vivo na API do GHL: contato
-- retorna "Contact not found", não é atraso de sync, é órfão
-- permanente): contact_id da oportunidade não existe em ghl_contacts
-- E a oportunidade já tem mais de 2 dias -- a margem de 2 dias evita
-- excluir por engano uma venda genuína de hoje/ontem cujo contato
-- ainda não teve tempo de sincronizar (mesma janela que já vimos se
-- resolver sozinha em horas, não dias).
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
  where c.id is null
    and o.created_at < now() - interval '2 days'
) x;
