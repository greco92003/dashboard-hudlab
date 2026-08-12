create table if not exists public.webhook_idempotency (
  provider text not null,
  idempotency_key text not null,
  payload_sha256 text not null,
  request_timestamp timestamptz,
  received_at timestamptz not null default now(),
  primary key (provider, idempotency_key),
  constraint webhook_idempotency_provider_check
    check (provider in ('nuvemshop', 'manychat', 'activecampaign', 'ghl')),
  constraint webhook_idempotency_payload_sha256_check
    check (payload_sha256 ~ '^[0-9a-f]{64}$')
);

alter table public.webhook_idempotency enable row level security;

revoke all on table public.webhook_idempotency from public, anon, authenticated;
grant select, insert on table public.webhook_idempotency to service_role;

create index if not exists webhook_idempotency_received_at_idx
  on public.webhook_idempotency (received_at desc);

comment on table public.webhook_idempotency is
  'Atomic replay protection for authenticated external webhook deliveries.';

-- Existing Nuvemshop deliveries already carry a provider-generated unique
-- notification ID. Backfill them so a captured historical request cannot be
-- accepted immediately after this control is deployed.
insert into public.webhook_idempotency (
  provider,
  idempotency_key,
  payload_sha256,
  received_at
)
select distinct on (headers::jsonb ->> 'x-notification-id')
  'nuvemshop',
  headers::jsonb ->> 'x-notification-id',
  encode(digest(convert_to(coalesce(payload::text, ''), 'UTF8'), 'sha256'), 'hex'),
  received_at
from public.nuvemshop_webhook_logs
where headers is not null
  and headers::jsonb ? 'x-notification-id'
  and coalesce(headers::jsonb ->> 'x-notification-id', '') <> ''
order by headers::jsonb ->> 'x-notification-id', received_at asc
on conflict (provider, idempotency_key) do nothing;

-- Provider event IDs may arrive in unsigned headers. Enforce uniqueness on
-- the authenticated body hash as well, so changing only such a header cannot
-- bypass replay protection. Historical retries are derived data and collapse
-- to their earliest claim.
with ranked_claims as (
  select
    provider,
    idempotency_key,
    row_number() over (
      partition by provider, payload_sha256
      order by received_at asc, idempotency_key asc
    ) as claim_rank
  from public.webhook_idempotency
)
delete from public.webhook_idempotency target
using ranked_claims duplicate
where duplicate.claim_rank > 1
  and target.provider = duplicate.provider
  and target.idempotency_key = duplicate.idempotency_key;

create unique index if not exists webhook_idempotency_payload_sha256_idx
  on public.webhook_idempotency (provider, payload_sha256);
