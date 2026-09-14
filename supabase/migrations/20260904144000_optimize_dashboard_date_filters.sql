-- Evita varreduras completas nas consultas mais frequentes dos dashboards.
-- As expressões repetem exatamente os filtros usados pelas views/RPCs.

create index if not exists idx_ghlo_created_sp_date
  on public.ghl_opportunities (
    ((created_at at time zone 'America/Sao_Paulo')::date)
  );

create index if not exists idx_ghlo_won_effective_at
  on public.ghl_opportunities (coalesce(won_at, updated_at))
  where status = 'won';

create index if not exists idx_ghlo_won_sp_date
  on public.ghl_opportunities (
    ((coalesce(won_at, updated_at) at time zone 'America/Sao_Paulo')::date)
  )
  where status = 'won';

create index if not exists idx_ghlo_migration_source_contact
  on public.ghl_opportunities (contact_id)
  where (raw ->> 'source') ilike '%activecampaign migration%';

create index if not exists idx_ghl_funnel_events_received_sp_date
  on public.ghl_funnel_events (
    ((received_at at time zone 'America/Sao_Paulo')::date)
  );

analyze public.ghl_opportunities;
analyze public.ghl_funnel_events;
