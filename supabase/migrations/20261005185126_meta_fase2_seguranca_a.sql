-- Fase 2 do Meta Marketing (segurança), parte A: tudo o que pode entrar
-- antes do deploy das telas sem quebrar nada. A parte B tira o acesso que as
-- telas antigas ainda usam.

-- 1) Leituras que as telas faziam direto nas views passam a sair pela rota
--    /api/meta-marketing/report, que exige usuário aprovado e usa service_role.
create or replace function public.get_atribuicao_saude()
returns setof public.v_atribuicao_saude
language sql stable security definer set search_path = ''
as $$ select * from public.v_atribuicao_saude $$;

create or replace function public.get_utm_sem_match()
returns setof public.v_utm_sem_match
language sql stable security definer set search_path = ''
as $$ select * from public.v_utm_sem_match limit 100 $$;

create or replace function public.get_leads_sem_venda()
returns setof public.v_leads_sem_venda
language sql stable security definer set search_path = ''
as $$ select * from public.v_leads_sem_venda $$;

create or replace function public.get_vendas_sem_pares(p_inicio date, p_fim date)
returns setof public.v_vendas_sem_pares
language sql stable security definer set search_path = ''
as $$
  select * from public.v_vendas_sem_pares
  where dia_venda between p_inicio and p_fim
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.get_atribuicao_saude()',
    'public.get_utm_sem_match()',
    'public.get_leads_sem_venda()',
    'public.get_vendas_sem_pares(date,date)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- 2) Funções de relatório que o navegador não chama: só service_role (rota
--    e edge functions). get_nomes_pipelines fica para a parte B.
do $$
declare f text;
begin
  foreach f in array array[
    'public._kpis_periodo(date,date)',
    'public.get_resumo_periodo(date,date)',
    'public.get_serie_diaria(date,date)',
    'public.get_funil_etapas(date,date)',
    'public.get_desempenho_fonte(date,date)',
    'public.get_funnel_por_anuncio(date,date)',
    'public.reconciliacao_meta_ghl(date,date)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- 3) Função de trigger: só roda pelo trg_ghl_contact_tags, ninguém precisa
--    de EXECUTE nela.
revoke execute on function public.sync_ghl_contact_tags() from public, anon, authenticated;

-- 4) Views e MVs do módulo nunca recebem escrita pelo navegador.
do $$
declare r text;
begin
  foreach r in array array[
    'v_atribuicao_saude','v_leads_sem_venda','v_utm_sem_match','v_vendas_sem_pares',
    'v_vendas','v_desempenho_uf_mes','v_sazonalidade_regiao',
    'mv_contato_atribuicao','mv_contatos_importados'
  ] loop
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', r);
  end loop;
end $$;

-- 5) Views e MVs que o navegador não lê: só service_role e funções do dono.
revoke select on public.v_vendas, public.mv_contato_atribuicao, public.mv_contatos_importados
  from anon, authenticated;

-- 6) Tabelas do módulo: "read authenticated" (true) somado ao
--    approved_user_gate permissivo liberava leitura a qualquer logado e
--    escrita pelo navegador ao aprovado. Fica só leitura para aprovado, como
--    deals_cache; quem grava são as edge functions com service_role.
do $$
declare t text;
begin
  foreach t in array array[
    'meta_ad_attributes','meta_ad_creative_analysis','meta_ad_creative_insights',
    'meta_ghl_ad_insights','ghl_contact_tags'
  ] loop
    execute format('drop policy if exists "read authenticated" on public.%I', t);
    execute format('drop policy if exists approved_user_gate on public.%I', t);
    execute format('drop policy if exists approved_read on public.%I', t);
    execute format(
      'create policy approved_read on public.%I for select to authenticated using ((select private.is_approved_user()))', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
  end loop;
end $$;
