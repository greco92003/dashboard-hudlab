-- A ordem de compra passa a viver no Tiny, não aqui.
--
-- O motivo é o vínculo com a nota fiscal: `GET /ordem-compra/{id}` no Tiny
-- devolve a nota vinculada, e é isso que torna o abatimento exato. Mantendo a
-- OC em duas bases, uma delas ficaria sempre desatualizada em relação à outra.
--
-- A tabela viveu poucas horas e só recebeu a OC 1908 de teste, então não há
-- histórico a preservar.
drop table if exists public.ordem_compra_item;
drop table if exists public.ordem_compra;
