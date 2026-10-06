-- Saúde das integrações do GHL, mostrada ao admin no Live Dashboard.
--
-- Existe por causa de 04/09-06/10/2026: o webhook de negócios parou de
-- gravar em silêncio e o sync completo quebrou por um valor inválido no GHL,
-- e nada disso aparecia em lugar nenhum. Uma linha por integração; quem
-- escreve é o servidor (lib/ghl/integration-health.ts).

create table public.integration_health (
  key text primary key,
  status text not null check (status in ('ok', 'atencao')),
  mensagem text,
  detalhe jsonb not null default '{}'::jsonb,
  verificado_em timestamptz not null default now(),
  ultimo_problema_em timestamptz,
  ultimo_ok_em timestamptz
);

comment on table public.integration_health is
  'Estado de cada integração (webhook e syncs do GHL). Lido por /api/admin/integration-health.';

-- Só o servidor (service role) lê e escreve.
alter table public.integration_health enable row level security;
revoke all on public.integration_health from anon, authenticated;
