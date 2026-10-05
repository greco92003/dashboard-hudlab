-- Instagram Orgânico e webhook_rejections: "read authenticated" (true)
-- deixava qualquer usuário logado, mesmo não aprovado, ler tudo.
--
-- Instagram: as views v_ig_* são security_invoker e get_instagram_resumo_periodo
-- roda com a permissão de quem chama, então todas passam pelo RLS das tabelas.
-- Basta a leitura das tabelas exigir usuário aprovado (mesmo padrão de
-- deals_cache). Quem grava são as edge functions sync-instagram e
-- ig-inteligencia, com service_role.
--
-- Conferido como authenticated: não aprovado lê 0 linhas em todas as tabelas
-- e views do Instagram; aprovado lê tudo (477 mídias, 131 auditorias, 75
-- itens de calendário) em 0,14 s. Tela conferida logado como aprovado.
--
-- Antes: as cinco tabelas tinham só "read authenticated" (PERMISSIVE SELECT
-- to authenticated using true) e authenticated tinha INSERT/UPDATE/DELETE.
do $$
declare t text;
begin
  foreach t in array array['ig_auditorias','ig_calendario_semanal','ig_media','ig_media_insights_daily'] loop
    execute format('drop policy if exists "read authenticated" on public.%I', t);
    execute format('drop policy if exists approved_read on public.%I', t);
    execute format(
      'create policy approved_read on public.%I for select to authenticated using ((select private.is_approved_user()))', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
  end loop;
end $$;

revoke insert, update, delete, truncate on public.v_ig_atributos, public.v_ig_media_latest,
  public.v_ig_trilha_performance from anon, authenticated;

revoke all on sequence public.ig_auditorias_id_seq, public.ig_calendario_semanal_id_seq
  from anon, authenticated;

revoke execute on function public.get_instagram_resumo_periodo(date, date) from public, anon;

-- webhook_rejections: só o servidor lê e grava (lib/security/webhook-rejections.ts
-- e scripts/checagem-diaria.mjs, ambos com a chave secreta). Sem política para
-- authenticated, o RLS nega tudo a quem não é service_role.
drop policy if exists "read authenticated" on public.webhook_rejections;
revoke all on public.webhook_rejections from anon, authenticated;
