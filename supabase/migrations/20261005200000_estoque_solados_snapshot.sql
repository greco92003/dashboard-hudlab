-- Estoque de solados servido do banco em vez de lido ao vivo a cada tela.
--
-- O GHL entra por evento: cada webhook de oportunidade regrava só o seu
-- negócio. O Tiny entra por snapshot: saldo e "a caminho" são lidos juntos e
-- gravados juntos (ver `BaseSolados` em lib/estoque/solados-source.ts), quando
-- algo muda — OC criada pelo dashboard, webhook de estoque, botão Atualizar.
-- O navegador nunca lê estas tabelas diretamente.

create table public.estoque_solados_negocios (
  deal_id text primary key,
  negocio jsonb not null,
  atualizado_em timestamptz not null default now()
);

alter table public.estoque_solados_negocios enable row level security;
revoke all on public.estoque_solados_negocios from anon, authenticated;
grant select, insert, update, delete on public.estoque_solados_negocios to service_role;

-- Linha única. `sujo` marca que algo mudou no Tiny enquanto uma leitura já
-- corria: quem está lendo lê de novo ao terminar, em vez de duas leituras
-- disputarem o limite de chamadas do Tiny.
create table public.estoque_solados_estado (
  id smallint primary key default 1 check (id = 1),
  skus jsonb,
  a_caminho jsonb,
  tiny_lido_em timestamptz,
  ghl_varrido_em timestamptz,
  sujo boolean not null default false,
  leitura_iniciada_em timestamptz
);

insert into public.estoque_solados_estado (id) values (1);

alter table public.estoque_solados_estado enable row level security;
revoke all on public.estoque_solados_estado from anon, authenticated;
grant select, update on public.estoque_solados_estado to service_role;

-- Reserva atômica da leitura do Tiny entre instâncias. Uma leitura que morreu
-- no meio libera a vez depois de cinco minutos.
create function public.try_claim_estoque_solados_tiny()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.estoque_solados_estado
     set leitura_iniciada_em = now(),
         sujo = false
   where id = 1
     and (leitura_iniciada_em is null
          or leitura_iniciada_em < now() - interval '5 minutes');
  return found;
end;
$$;

revoke all on function public.try_claim_estoque_solados_tiny()
  from public, anon, authenticated;
grant execute on function public.try_claim_estoque_solados_tiny()
  to service_role;
