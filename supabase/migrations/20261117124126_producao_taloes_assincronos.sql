-- Um registro por negócio enquanto estiver em Produção de Pedidos.
-- A fila e o PDF têm o mesmo ciclo de vida e só o servidor pode acessá-los.
create table public.producao_taloes (
  deal_id text primary key,
  pdf bytea,
  numero_pedido text,
  disponivel_apos timestamptz not null default now(),
  tentativa integer not null default 0,
  token uuid,
  reservado_ate timestamptz,
  pedido_ausente boolean not null default false,
  check ((pdf is null) = (numero_pedido is null)),
  check ((token is null) = (reservado_ate is null))
);

alter table public.producao_taloes enable row level security;
revoke all on public.producao_taloes from public, anon, authenticated;
grant select, insert, update, delete on public.producao_taloes to service_role;

create index producao_taloes_pendentes
  on public.producao_taloes (disponivel_apos, deal_id)
  where numero_pedido is null;

-- O cache do GHL é sincronizado pelo webhook, pelo cron e pelo botão Concluir.
-- A fila acompanha a etapa na mesma transação, inclusive se o webhook faltar.
create function public.sincronizar_fila_producao_taloes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.source_system = 'ghl' and old.stage_title = 'Produção de Pedidos' then
      delete from public.producao_taloes where deal_id = old.deal_id;
    end if;
  elsif new.source_system = 'ghl'
    and new.stage_title = 'Produção de Pedidos'
    and new.status = 'won'
    and new.sync_status = 'synced' then
    insert into public.producao_taloes (deal_id)
    values (new.deal_id)
    on conflict (deal_id) do nothing;
  elsif tg_op = 'UPDATE' then
    if old.source_system = 'ghl' and old.stage_title = 'Produção de Pedidos' then
      delete from public.producao_taloes where deal_id = old.deal_id;
    end if;
  end if;
  return null;
end;
$$;

revoke execute on function public.sincronizar_fila_producao_taloes() from public, anon, authenticated;
grant execute on function public.sincronizar_fila_producao_taloes() to service_role;

create trigger sincronizar_fila_producao_taloes
after insert or update of stage_title, status, sync_status, source_system or delete
on public.deals_cache
for each row execute function public.sincronizar_fila_producao_taloes();

-- Uma geração por vez para compartilhar a capacidade da API do Tiny com o app.
-- Se uma função for encerrada, o mesmo trabalho volta a ficar disponível.
create function public.reservar_producao_talao(p_token uuid, p_deal_id text default null)
returns table (deal_id text, tentativa integer)
language plpgsql
set search_path = ''
as $$
begin
  if not pg_catalog.pg_try_advisory_xact_lock(236716, 1) then
    return;
  end if;
  if exists (
    select 1 from public.producao_taloes as fila
    where fila.reservado_ate > now()
  ) then
    return;
  end if;

  return query
    with proximo as (
      select fila.deal_id
      from public.producao_taloes as fila
      where fila.numero_pedido is null
        and fila.disponivel_apos <= now()
        and (fila.reservado_ate is null or fila.reservado_ate <= now())
        and (p_deal_id is null or fila.deal_id = p_deal_id)
      order by fila.disponivel_apos, fila.deal_id
      limit 1
      for update skip locked
    )
    update public.producao_taloes as fila
    set token = p_token,
        reservado_ate = now() + interval '6 minutes',
        tentativa = fila.tentativa + 1,
        pedido_ausente = false
    from proximo
    where fila.deal_id = proximo.deal_id
    returning fila.deal_id, fila.tentativa;
end;
$$;

revoke execute on function public.reservar_producao_talao(uuid, text) from public, anon, authenticated;
grant execute on function public.reservar_producao_talao(uuid, text) to service_role;

insert into public.producao_taloes (deal_id)
select deal_id
from public.deals_cache
where source_system = 'ghl'
  and stage_title = 'Produção de Pedidos'
  and status = 'won'
  and sync_status = 'synced'
on conflict (deal_id) do nothing;
