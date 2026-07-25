-- ============================================================
-- Enable Supabase Realtime on ghl_funnel_events so the "Atendimentos
-- Reais" tab (app/sellers_v2/page.tsx) can refresh the active-negotiations
-- list the moment a new "emnegociacao" webhook event is inserted, instead
-- of relying on a manual page reload or a polling interval.
-- ============================================================

alter publication supabase_realtime add table public.ghl_funnel_events;
