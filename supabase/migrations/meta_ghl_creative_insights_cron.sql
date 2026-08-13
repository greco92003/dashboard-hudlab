-- ============================================================
-- Criado em 2026-08-13
--
-- Roda depois do meta-ghl-insights (09:25 UTC), com folga -- não
-- depende dele, mas evita sobrecarregar o mesmo minuto. Diferente do
-- pipeline caro (meta-ghl-creative-analysis, visão+Whisper, não tem
-- cron -- roda sob demanda porque a rotação de criativo é baixa),
-- esse é barato (texto só, dado já em cache) e a métrica de
-- performance muda todo dia, então faz sentido recalcular diariamente.
-- ============================================================

select cron.schedule(
  'meta-ghl-creative-insights-daily',
  '35 9 * * *',
  $$
  select net.http_post(
    url := 'https://ubqervuhvwnztxmsodlg.supabase.co/functions/v1/meta-ghl-creative-insights',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 180000
  );
  $$
);
