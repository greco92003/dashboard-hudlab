-- ============================================================
-- Aviso de lead quente para a Schay (cron nao-lidas, a cada 10 min).
-- contact_tags: tags do contato na hora da atualização, para saber se a
-- Cami está atendendo (ia-atendimento) e não avisar.
-- hot_notified_message_id / hot_notified_at: última mensagem do cliente já
-- avisada (ou dispensada), para avisar uma vez por mensagem nova.
-- ============================================================

alter table public.ghl_unread_triage
  add column if not exists contact_tags text[],
  add column if not exists hot_notified_message_id text,
  add column if not exists hot_notified_at timestamptz;
