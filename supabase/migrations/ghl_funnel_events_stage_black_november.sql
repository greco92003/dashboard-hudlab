-- ============================================================
-- Braço "Black November" no CHECK de ghl_funnel_events (2026-11-02)
--
-- O PR #70 (29/10) criou o braço black_november no código e o GHL ganhou o
-- workflow "[webhook] blacknovember", mas o CHECK da tabela continuou com a
-- lista antiga de etapas. Todo evento `blacknovember` era recusado com 500
-- (falha_ao_gravar, código 23514): 429 recusas entre 30/10 e 02/11 em
-- webhook_rejections, e o braço sumiu do /funil desde a virada de 01/11.
--
-- 1) Libera o slug no CHECK.
-- 2) Recompõe os eventos perdidos a partir da tag `blacknovember` do sync de
--    contatos. As recusas não guardaram o contact_id, então a âncora é o
--    evento de lead do contato (o webhook dispara logo depois dele) e, sem
--    lead, a primeira observação da tag. Só contatos marcados a partir de
--    01/11 00:00 BRT, para deixar de fora os testes de 30-31/10.
--    Idempotente: não insere se o contato já tem evento `blacknovember`.
-- ============================================================

ALTER TABLE public.ghl_funnel_events
  DROP CONSTRAINT IF EXISTS ghl_funnel_events_stage_slug_check;

ALTER TABLE public.ghl_funnel_events
  ADD CONSTRAINT ghl_funnel_events_stage_slug_check CHECK (
    stage_slug IN (
      'lead',
      'commockautomatico',
      'semmockautomatico',
      'atendimentoladob',
      'blacknovember',
      'solicitouorcamento',
      'solicitoumockupoficial',
      'emnegociacao',
      'negociofechado'
    )
  );

INSERT INTO public.ghl_funnel_events (
  event_type, stage_slug, stage_name, contact_id, contact_name, contact_phone,
  quantidade_pares, tags, location_id, workflow_name, contact_created_at,
  received_at, raw_payload
)
SELECT
  'contact_tag_added',
  'blacknovember',
  'Black November',
  t.contact_id,
  l.contact_name,
  l.contact_phone,
  l.quantidade_pares,
  array(SELECT DISTINCT unnest(coalesce(l.tags, '{}'::text[]) || ARRAY['blacknovember'])),
  l.location_id,
  '[webhook] blacknovember (recomposto)',
  l.contact_created_at,
  coalesce(l.received_at, t.primeiro_visto_em),
  jsonb_build_object(
    'origem', 'recomposto_2026-11-02',
    'motivo', 'CHECK de stage_slug recusava blacknovember'
  )
FROM public.ghl_contact_tags t
LEFT JOIN LATERAL (
  SELECT e.*
  FROM public.ghl_funnel_events e
  WHERE e.contact_id = t.contact_id
    AND e.stage_slug = 'lead'
    AND e.received_at >= '2026-11-01 03:00:00+00'
  ORDER BY e.received_at
  LIMIT 1
) l ON true
WHERE t.tag = 'blacknovember'
  AND coalesce(l.received_at, t.primeiro_visto_em) >= '2026-11-01 03:00:00+00'
  AND NOT EXISTS (
    SELECT 1 FROM public.ghl_funnel_events x
    WHERE x.contact_id = t.contact_id AND x.stage_slug = 'blacknovember'
  );
