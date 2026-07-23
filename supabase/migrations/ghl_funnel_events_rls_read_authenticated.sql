-- ============================================================
-- Fix 2026-07-23 (aplicado no Dashboard-v2 via MCP)
--
-- Depois das migrations que passaram a ler ghl_funnel_events em
-- get_funnel_por_anuncio/_kpis_periodo/v_desempenho_uf_mes, o dashboard
-- em produção continuou mostrando números baixos (ex.: "Leads" e
-- "Solicitações de Mockup" batendo exatamente com o braço legado sozinho,
-- como se o braço webhook sempre retornasse zero) mesmo depois de hard
-- refresh.
--
-- Causa raiz: ghl_funnel_events só tinha a política de RLS
-- "approved_user_gate" (qual = private.is_approved_user()). TODAS as outras
-- tabelas do módulo (ghl_opportunities, ghl_contacts, meta_insights_daily)
-- têm uma SEGUNDA política "read authenticated" (cmd=SELECT, qual=true)
-- que libera leitura pra qualquer usuário autenticado, independente do
-- gate -- ghl_funnel_events nunca ganhou essa política quando foi criada
-- (tabela pré-existente do outro pipeline, "/funil", cujo acesso sempre
-- foi via service role no servidor, nunca via client-side RPC).
--
-- Confirmado por simulação direta (set_config('request.jwt.claims',...) +
-- set role authenticated): 0 linhas visíveis antes deste fix, mesmo para
-- um usuário com approved=true em user_profiles.
-- ============================================================

create policy "read authenticated"
  on public.ghl_funnel_events
  for select
  to authenticated
  using (true);
