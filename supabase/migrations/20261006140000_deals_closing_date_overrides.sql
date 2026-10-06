-- Datas de fechamento corrigidas à mão, que o GHL não reflete.
--
-- O fechamento de um negócio ganho vem do lastStatusChangeAt do GHL
-- (lib/ghl/closing-date.ts). Quando a data comercial real difere dela,
-- editar o GHL não basta: o sync completo, o sync de ganhos (15 min) e o
-- webhook regravariam a data do GHL. Esta tabela é a exceção registrada, e o
-- gatilho abaixo a aplica em qualquer INSERT/UPDATE de deals_cache, venha de
-- sync, webhook, seed ou script. Para desfazer, apague a linha da exceção e
-- rode o sync completo.

create table public.deals_closing_date_overrides (
  deal_id text primary key,
  closing_date date not null,
  motivo text not null,
  criado_em timestamptz not null default now(),
  criado_por text
);

comment on table public.deals_closing_date_overrides is
  'Fechamento manual por negócio. Prevalece sobre o GHL em deals_cache via gatilho apply_deals_closing_date_override.';

-- Só o servidor (service role) lê e escreve.
alter table public.deals_closing_date_overrides enable row level security;
revoke all on public.deals_closing_date_overrides from anon, authenticated;

create or replace function private.apply_deals_closing_date_override()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $$
declare
  override_date date;
begin
  select closing_date into override_date
  from public.deals_closing_date_overrides
  where deal_id = new.deal_id;

  if found then
    -- Mesmo formato gravado pelo sync: meia-noite UTC do dia.
    new.closing_date := override_date::timestamp at time zone 'UTC';
    new.provider_payload := jsonb_set(
      coalesce(new.provider_payload, '{}'::jsonb),
      '{closing_date}',
      to_jsonb(override_date::text),
      true
    );
  end if;
  return new;
end;
$$;

create trigger apply_deals_closing_date_override
before insert or update on public.deals_cache
for each row execute function private.apply_deals_closing_date_override();

insert into public.deals_closing_date_overrides (deal_id, closing_date, motivo, criado_por) values
  ('K1TqlPp1LIfTz4RDEmUn', date '2026-09-14',
   'Diego - SP MEGA OOH: venda de setembro, junto com o BH (pXERUqAH1UGyaueVbg0U); marcado como ganho no GHL só em 06/10/2026.',
   'hudlabprivatelabel@gmail.com'),
  ('WOHg1DZoUkfy9d1dlsNZ', date '2026-09-14',
   'Diego - MEGA OHH (pedido futuro): venda de setembro, junto com o BH (pXERUqAH1UGyaueVbg0U); marcado como ganho no GHL só em 06/10/2026.',
   'hudlabprivatelabel@gmail.com');

-- Aplica já às linhas existentes; o gatilho faz a troca.
update public.deals_cache
set last_change_source = 'manual',
    last_request_id = 'override-fechamento-2026-10-06'
where deal_id in (select deal_id from public.deals_closing_date_overrides);
