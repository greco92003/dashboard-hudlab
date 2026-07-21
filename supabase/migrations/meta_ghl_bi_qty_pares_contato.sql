-- No GHL da Hud Lab o campo "Qntd Pares" existe no CONTATO
-- (contact.qntd_pares), não na oportunidade. Guardamos nos dois e o
-- cálculo de pares usa o da oportunidade com fallback no do contato.
-- (já aplicado no projeto Dashboard-v2 via MCP em 2026-07-21;
--  _kpis_periodo atualizado na mesma migration — ver histórico no banco)
alter table public.ghl_contacts add column if not exists qty_pares int;
