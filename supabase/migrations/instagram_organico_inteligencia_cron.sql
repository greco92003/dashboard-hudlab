-- ============================================================
-- Instagram Orgânico - Inteligência - Cron semanal
-- Segunda-feira 09:00 Brasília (12:00 UTC): roda Auditor + Estrategista
-- em sequência (phase default = "all"). A chamada inicial só dispara
-- o processamento -- o resto acontece via chaining em background
-- (EdgeRuntime.waitUntil), mesmo padrão do sync-ghl/sync-instagram.
-- ============================================================
select cron.schedule(
  'ig-inteligencia-semanal',
  '0 12 * * 1',
  $$
  select net.http_post(
    url := 'https://ubqervuhvwnztxmsodlg.supabase.co/functions/v1/ig-inteligencia',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
