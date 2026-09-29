-- ============================================================
-- Trava por contato da IA vendedora: no máximo uma rodada em andamento
-- (decision = 'rodando') por contato. Uma rajada de mensagens dispara várias
-- chamadas do workflow; sem a trava, duas rodadas simultâneas respondiam o
-- cliente em dobro. A rodada insere a linha 'rodando' no início e a atualiza
-- com a decisão final no fim; a segunda chamada bate no índice e vira
-- 'pulou:em_andamento'. Aditiva: só cria o índice.
-- ============================================================

create unique index if not exists ai_seller_runs_um_rodando_por_contato
  on public.ai_seller_runs (contact_id)
  where decision = 'rodando';
