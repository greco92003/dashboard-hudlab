-- Sync de Stories a cada 30 minutos, desacoplado do sync de mídia
-- permanente (instagram_organico_cron.sql, 3x/dia). Stories só existem
-- via API enquanto ativos (24h) -- o cron principal tem um buraco de
-- até 12h de madrugada (21h->09h Brasília), o que faz perder as
-- últimas horas de visualização de stories postados nesse intervalo
-- antes de expirarem. Rodar a cada 30min reduz esse buraco a no máximo
-- 30min, e como o phase=stories só bate no endpoint /stories (barato,
-- 1-2 chamadas independente de quantos stories estão ativos), rodar
-- com essa frequência não tem custo relevante de API.
select cron.schedule(
  'sync-instagram-stories-30min',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://ubqervuhvwnztxmsodlg.supabase.co/functions/v1/sync-instagram',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"phase": "stories"}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
