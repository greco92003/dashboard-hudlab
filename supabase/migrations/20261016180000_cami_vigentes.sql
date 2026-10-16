-- ============================================================
-- Regras comerciais vigentes da Cami ("Ensinar a Cami", parte 3), no Controle.
--
-- promocao: uma por vez, com prazo — {nome, inicio, fim, descontoPct,
--   minPares, texto}. A ferramenta de orçamento aplica o desconto enquanto
--   vale; acumula com os 5% do PIX. null = sem promoção.
-- avisos: avisos comerciais com prazo, sem desconto — [{texto, inicio, fim}].
--
-- Não mudam o jeito de atender da Cami. Escrita só pelo dono (rota do Controle).
-- ============================================================

alter table public.ai_seller_settings
  add column if not exists promocao jsonb,
  add column if not exists avisos jsonb not null default '[]';
