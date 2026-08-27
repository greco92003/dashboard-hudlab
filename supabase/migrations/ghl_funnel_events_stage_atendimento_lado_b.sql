-- ============================================================
-- Novo braço do teste A/B: "Atendimento Lado B" (2026-08-27)
--
-- Em 26/08/2026 o braço "Com Mockup Automático" foi aposentado e substituído
-- pelo "Atendimento Lado B". O braço novo NÃO tem webhook próprio: a tag
-- `atendimento_lado_b` só viaja no array `tags` dos eventos das outras
-- etapas e no sync de contatos, e é de lá que o funil o reconstrói (ver
-- buildVariantTagEvents em app/api/ghl/funnel/route.ts).
--
-- Esta migration é seguro-antecipado. Se um dia a automação passar a
-- disparar um webhook dedicado para essa tag, o CHECK anterior rejeitaria a
-- linha e o evento se perderia em silêncio -- o endpoint responde 422 e nada
-- é gravado. Com o slug liberado, o webhook passa a funcionar sem mudança de
-- código: normalizeGhlFunnelStage já converte "atendimento_lado_b" em
-- "atendimentoladob".
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
      'solicitouorcamento',
      'solicitoumockupoficial',
      'emnegociacao',
      'negociofechado'
    )
  );
