-- Agendamento dos syncs diários (pg_cron + pg_net)
-- (já aplicado no projeto Dashboard-v2 via MCP em 2026-07-21)
-- 06:00 / 06:10 America/Sao_Paulo = 09:00 / 09:10 UTC
-- Se um dia definir SYNC_SECRET nas edge functions, adicione o header
-- "x-sync-secret" nos http_post abaixo.

create extension if not exists pg_cron;

select cron.schedule(
  'sync-meta-daily',
  '0 9 * * *',
  $$
  select net.http_post(
    url := 'https://ubqervuhvwnztxmsodlg.supabase.co/functions/v1/sync-meta',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

select cron.schedule(
  'sync-ghl-daily',
  '10 9 * * *',
  $$
  select net.http_post(
    url := 'https://ubqervuhvwnztxmsodlg.supabase.co/functions/v1/sync-ghl',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
  $$
);
