-- ============================================================
-- Criado em 2026-07-25 (aplicado no Dashboard-v2 via MCP)
--
-- View reutilizável: contact_id de qualquer contato com tag contendo a
-- palavra "import" (case-insensitive) -- em ghl_contacts.raw->tags (se o
-- contato chegou a sincronizar) OU em qualquer evento de
-- ghl_funnel_events.tags (cobre o caso comum: contato de importação em
-- massa que nem chega a virar ghl_opportunities/ghl_contacts
-- sincronizado).
--
-- Motivo: achado ao investigar "poluição" na tabela de Anúncios --
-- 231 contatos receberam o evento "negociofechado" num intervalo de 9
-- minutos em 24/07 (19:46-19:55), com tags de negócios antigos e já
-- fechados ("blackfinal", "fechamesmaio26", etc.) -- migração de
-- registros históricos, não atividade orgânica do funil atual. Pedido
-- explícito do usuário: "ignorar completamente todos os leads com
-- qualquer tag com a palavra import".
--
-- Usada por get_funnel_por_anuncio, get_funil_etapas e _kpis_periodo pra
-- excluir esses registros de TODAS as contagens de lead/marco do módulo.
-- ============================================================

CREATE OR REPLACE VIEW public.v_contatos_importados
WITH (security_invoker = true) AS
SELECT DISTINCT contact_id FROM (
  SELECT c.id AS contact_id
  FROM public.ghl_contacts c
  WHERE EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(coalesce(c.raw->'tags', '[]'::jsonb)) t
    WHERE t ILIKE '%import%'
  )
  UNION
  SELECT e.contact_id
  FROM public.ghl_funnel_events e
  WHERE EXISTS (SELECT 1 FROM unnest(e.tags) t WHERE t ILIKE '%import%')
) x;
