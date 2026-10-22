-- "Leads frios" saiu da aba Anúncios em 22/10/2026 (PR #62), trocado por
-- get_conversao_criativos. Sem uso no app, nas edge functions nem em outra
-- função do banco.
drop function if exists public.get_leads_sem_venda();
drop view if exists public.v_leads_sem_venda;
