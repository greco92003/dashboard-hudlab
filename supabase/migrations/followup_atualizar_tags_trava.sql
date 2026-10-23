-- Botão "Atualizar" da aba Follow-Up: antes de recarregar os números, lê de
-- novo do GHL as tags medidas (sync-ghl {"phase":"tags","soTags":true}).
--
-- A trava é de 10 min, contados da última leitura de tags de qualquer origem
-- (este botão, o cron das 06:10 ou um sync manual). Não é só para poupar o
-- GHL: get_campanhas data o disparo pela execução de tags ANTERIOR à que viu
-- a tag, com 10 min de folga para separar os hops da mesma execução. Leituras
-- mais próximas que isso fariam a campanha pular para a execução de antes e
-- alargar a janela de vendas.
--
-- A linha no portão fecha a corrida de dois cliques antes de a primeira
-- execução gravar o sync_log (o log só sai no fim de cada hop, ~40 s).
create or replace function public.try_claim_followup_tags_refresh()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if exists (
    select 1 from public.sync_log
    where source = 'ghl_contact_tags'
      and status = 'success'
      and started_at > now() - interval '10 minutes'
  ) then
    return false;
  end if;

  insert into private.marketing_refresh_gate (name, claimed_at)
  values ('followup-tags', now())
  on conflict (name) do update
    set claimed_at = excluded.claimed_at
    where marketing_refresh_gate.claimed_at < now() - interval '10 minutes';
  return found;
end;
$$;

-- Leitura que falhou não segura o botão por 10 min.
create or replace function public.release_followup_tags_refresh()
returns void
language sql
security definer
set search_path = pg_catalog, private
as $$
  delete from private.marketing_refresh_gate where name = 'followup-tags';
$$;

revoke all on function public.try_claim_followup_tags_refresh() from public, anon, authenticated;
revoke all on function public.release_followup_tags_refresh() from public, anon, authenticated;
grant execute on function public.try_claim_followup_tags_refresh() to service_role;
grant execute on function public.release_followup_tags_refresh() to service_role;
