-- Enable Supabase Realtime for programacao_cache so /programacao can
-- subscribe to postgres_changes and refresh automatically when the
-- ActiveCampaign webhook updates deals.
ALTER PUBLICATION supabase_realtime ADD TABLE public.programacao_cache;
