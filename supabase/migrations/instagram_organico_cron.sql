-- Agendamento do sync do Instagram Orgânico (pg_cron + pg_net)
-- 3x/dia em vez de 1x: stories só existem via API enquanto ativos
-- (24h), então rodar mais vezes aumenta a chance de capturar um antes
-- de expirar. Upsert idempotente (mídia por id, insights por
-- date+media_id), então repetir no mesmo dia é seguro.
-- 09:00 / 15:00 / 21:00 America/Sao_Paulo = 12:00 / 18:00 / 00:00 UTC

select cron.schedule(
  'sync-instagram-3x',
  '0 12,18,0 * * *',
  $$
  select net.http_post(
    url := 'https://ubqervuhvwnztxmsodlg.supabase.co/functions/v1/sync-instagram',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
