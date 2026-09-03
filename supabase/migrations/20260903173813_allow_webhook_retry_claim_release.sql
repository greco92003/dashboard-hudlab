-- A claim is normally permanent. The receiver removes it only when the
-- corresponding business write fails, allowing the provider's retry to run.
grant delete on table public.webhook_idempotency to service_role;
