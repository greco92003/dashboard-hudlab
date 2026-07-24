-- ============================================================
-- Fix (final whole-branch review, 2026-07-24): ghl_negotiation_evaluations
-- and ghl_negotiation_insights were created after
-- 20260721141158_harden_rls_and_privileged_functions.sql's approved-user
-- sweep, so they never got the same restrictive gate every sibling
-- user-facing table carries. Their only policy was "read authenticated"
-- (true) — any authenticated-but-unapproved account could read seller
-- names, per-seller scores/rankings, customer contact names, and full
-- coaching text. This closes that gap the same way the original sweep did.
-- ============================================================

drop policy if exists approved_user_gate on public.ghl_negotiation_evaluations;
create policy approved_user_gate on public.ghl_negotiation_evaluations
  as restrictive for all to authenticated
  using ((select private.is_approved_user()))
  with check ((select private.is_approved_user()));
revoke all on table public.ghl_negotiation_evaluations from anon;

drop policy if exists approved_user_gate on public.ghl_negotiation_insights;
create policy approved_user_gate on public.ghl_negotiation_insights
  as restrictive for all to authenticated
  using ((select private.is_approved_user()))
  with check ((select private.is_approved_user()));
revoke all on table public.ghl_negotiation_insights from anon;
