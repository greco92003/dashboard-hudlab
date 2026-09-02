-- Os dados de conversa e os resumos são acessados exclusivamente pelas rotas
-- protegidas do servidor. Evita expor PII diretamente pelo Data API.

drop policy if exists "Authenticated users read mockup instruction cache"
  on public.ghl_mockup_conversation_cache;
drop policy if exists "Authenticated users read mockup instruction history"
  on public.ghl_mockup_instruction_runs;

revoke all on table public.ghl_mockup_conversation_cache from authenticated;
revoke all on table public.ghl_mockup_instruction_runs from authenticated;

grant all on table public.ghl_mockup_conversation_cache to service_role;
grant all on table public.ghl_mockup_instruction_runs to service_role;
