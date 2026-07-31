-- ============================================================
-- Criado em 2026-07-31 (aplicado no Dashboard-v2 via MCP)
--
-- Roda depois do sync-meta (09:00 UTC) e sync-ghl (09:10 UTC), com folga
-- pra garantir dado fresco do dia antes de gerar as recomendações.
-- ============================================================

select cron.schedule(
  'meta-ghl-insights-daily',
  '25 9 * * *',
  $$
  select net.http_post(
    url := 'https://ubqervuhvwnztxmsodlg.supabase.co/functions/v1/meta-ghl-insights',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
