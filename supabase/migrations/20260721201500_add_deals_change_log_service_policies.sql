-- Keep the audit log inaccessible to user-facing roles while making the
-- service-role access explicit for RLS-aware tooling and future role changes.

create policy "Service role can insert deal audit"
on public.deals_change_log
for insert
to service_role
with check (true);

create policy "Service role can read deal audit"
on public.deals_change_log
for select
to service_role
using (true);
