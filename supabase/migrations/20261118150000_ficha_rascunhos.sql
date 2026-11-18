-- Rascunho da ficha do pedido montado pela Cami a partir da conversa do GHL.
-- Gerado quando a oportunidade entra em "Pagamento Confirmado/Completar Dados"
-- (webhook) ou pelo botão do cadastro de pedido. Nada daqui vai para o GHL:
-- o vendedor confere no /cadastro-pedido e salva. Só o servidor lê e grava.
create table if not exists public.ficha_rascunhos (
  opportunity_id text primary key,
  status text not null default 'gerando' check (status in ('gerando', 'pronto', 'erro')),
  rascunho jsonb,
  resposta jsonb,
  erro text,
  modelo text,
  versao_prompt text,
  token uuid,
  reservado_ate timestamptz,
  gerado_em timestamptz,
  atualizado_em timestamptz not null default now()
);

alter table public.ficha_rascunhos enable row level security;
revoke all on public.ficha_rascunhos from anon, authenticated;

-- Reserva a geração de um rascunho. Sem forçar, só gera quando não existe,
-- quando a última tentativa falhou ou quando uma geração travou (reserva de
-- 3 minutos vencida): o GHL manda vários webhooks para a mesma mudança de etapa.
create or replace function public.reservar_ficha_rascunho(
  p_opportunity_id text,
  p_token uuid,
  p_forcar boolean default false
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linhas integer;
begin
  insert into public.ficha_rascunhos as f (opportunity_id, status, token, reservado_ate, atualizado_em)
  values (p_opportunity_id, 'gerando', p_token, now() + interval '3 minutes', now())
  on conflict (opportunity_id) do update
    set status = 'gerando',
        token = excluded.token,
        reservado_ate = excluded.reservado_ate,
        erro = null,
        atualizado_em = now()
    where p_forcar
       or f.status = 'erro'
       or (f.status = 'gerando' and (f.reservado_ate is null or f.reservado_ate < now()));
  get diagnostics v_linhas = row_count;
  return v_linhas > 0;
end;
$$;

revoke all on function public.reservar_ficha_rascunho(text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.reservar_ficha_rascunho(text, uuid, boolean) to service_role;
