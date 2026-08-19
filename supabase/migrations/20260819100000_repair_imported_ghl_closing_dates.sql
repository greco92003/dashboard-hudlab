-- One-off repair for the ActiveCampaign -> GHL import on 2026-08-03.
--
-- During that bulk migration, historical opportunities were
-- created in GHL already marked as won. Their GHL lastStatusChangeAt therefore
-- describes the import, not the original sale. The migrated custom field
-- "Data de Fechamento" remains the source of truth for this historical cohort.
-- This is deliberately scoped to the anomalous date. Runtime resolution has
-- no date cutoff: lastStatusChangeAt wins in every period and the custom field
-- is the fallback whenever that timestamp is absent.

update public.deals_cache
set closing_date = custom_field_value::date,
    provider_payload = jsonb_set(
      coalesce(provider_payload, '{}'::jsonb),
      '{closing_date}',
      to_jsonb(custom_field_value),
      true
    ),
    last_change_source = 'manual',
    last_request_id = 'ac-ghl-cutover-2026-08-03',
    last_synced_at = now()
where source_system = 'ghl'
  and status = 'won'
  and closing_date = date '2026-08-03'
  and custom_field_value ~ '^\d{4}-\d{2}-\d{2}$'
  and custom_field_value::date <> date '2026-08-03'
  and closing_date is distinct from custom_field_value::date;
