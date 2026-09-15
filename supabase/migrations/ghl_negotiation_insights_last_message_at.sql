-- ============================================================
-- Adds last_message_at to ghl_negotiation_insights so the "Em Negociação"
-- ranking (app/api/sellers-v2/negotiations/route.ts) can show/derive
-- "days without movement" as (now() - last_message_at) without hitting the
-- GHL API on every page load — set once whenever an insight is generated
-- (on-demand click or the morning batch cron), from the transcript's last
-- message timestamp at that time.
-- ============================================================

alter table public.ghl_negotiation_insights
  add column if not exists last_message_at timestamptz;
