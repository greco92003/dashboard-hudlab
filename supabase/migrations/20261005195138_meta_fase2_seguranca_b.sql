-- Fase 2 do Meta Marketing (segurança), parte B: com as telas lendo pela
-- rota, o navegador perde o acesso direto ao que ainda usava.
-- Aplicada depois do deploy do PR #31, com zero chamadas a essas views pela
-- API desde o deploy. Conferido como authenticated: usuário não aprovado não
-- executa nem lê nada do módulo; aprovado lê só as tabelas com approved_read.
revoke select on public.v_atribuicao_saude, public.v_leads_sem_venda,
  public.v_utm_sem_match, public.v_vendas_sem_pares
  from anon, authenticated;

revoke execute on function public.get_nomes_pipelines() from public, anon, authenticated;
grant execute on function public.get_nomes_pipelines() to service_role;
