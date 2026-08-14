-- Deals moved to the operational "Fábrica de Mockups" pipeline are completed
-- sales. GHL resets their status to open during the move, which made the
-- analytical dashboards stop counting them. Keep the existing cache aligned
-- immediately; subsequent syncs apply the same rule in application code.
update public.deals_cache
set
  status = 'won',
  closing_date = coalesce(
    closing_date,
    nullif(provider_payload->>'ghl_last_status_change_at', '')::timestamptz,
    api_updated_at,
    last_synced_at
  ),
  updated_at = now()
where source_system = 'ghl'
  and pipeline_id = 'ShSCF8BTLIdKHAjq491X'
  and stage_id in (
    '49a81bf5-6148-4074-87d1-bc0aaed13a00',
    '7fb18489-0d66-4591-be25-5146e669b4e8'
  )
  and (
    status is distinct from 'won'
    or closing_date is null
  );
