-- ============================================================
-- Criado em 2026-07-31 (aplicado no Dashboard-v2 via MCP)
--
-- Novo veredito "PAUSADO": quando o anúncio JÁ está pausado no Meta
-- (effective_status via meta_ad_attributes), o meta-ghl-insights
-- registra isso direto, sem chamar o Claude -- evita a sugestão
-- redundante/confusa de "PAUSAR" pra algo que já foi pausado.
-- ============================================================

alter table public.meta_ghl_ad_insights
  drop constraint meta_ghl_ad_insights_veredito_check;

alter table public.meta_ghl_ad_insights
  add constraint meta_ghl_ad_insights_veredito_check
  check (veredito in ('ESCALAR', 'MANTER', 'REVISAR', 'PAUSAR', 'PAUSADO'));
