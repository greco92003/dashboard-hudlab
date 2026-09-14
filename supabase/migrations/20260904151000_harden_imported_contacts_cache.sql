-- O cache expõe os mesmos contact_ids que a view anterior, mas não precisa
-- aceitar escrita nem executar com os privilégios do proprietário.

alter view public.v_contatos_importados_source
  set (security_invoker = true);

alter view public.v_contatos_importados
  set (security_invoker = true);

revoke all on public.v_contatos_importados_source
  from public, anon, authenticated;

revoke all on public.v_contatos_importados
  from public, anon, authenticated;

grant select on public.mv_contatos_importados
  to authenticated, service_role;

grant select on public.v_contatos_importados
  to authenticated, service_role;
