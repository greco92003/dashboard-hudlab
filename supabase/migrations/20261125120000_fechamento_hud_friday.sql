-- Hud Friday (27/11/2026): marca no painel de fechamento quem recebeu o disparo
-- e a faixa que tocou ("100mais", "ate99", "enviado"). Vem das tags do contato.
ALTER TABLE public.fechamento_cards ADD COLUMN IF NOT EXISTS hud_friday text;
