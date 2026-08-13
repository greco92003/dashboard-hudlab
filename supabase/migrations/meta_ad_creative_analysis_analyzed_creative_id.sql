-- ============================================================
-- Criado em 2026-08-13
--
-- Reconciliação: a coluna analyzed_creative_id foi adicionada à
-- tabela meta_ad_creative_analysis via SQL direto (execute_sql) no
-- momento em que a meta-ghl-creative-analysis foi construída, sem
-- passar por apply_migration -- por isso nunca ficou registrada no
-- histórico de migrations do projeto, apesar de já estar ao vivo.
-- Este arquivo só formaliza o que já existe em produção (idempotente
-- via IF NOT EXISTS) pra fechar o gap entre o schema real e o
-- histórico de migrations rastreado.
--
-- analyzed_creative_id guarda o creative_id que estava vigente na
-- última vez que a análise (Claude/Whisper) rodou pra esse anúncio --
-- comparado contra creative_id (sempre atualizado pelo sync-meta) pra
-- decidir se o anúncio precisa ser reanalisado (criativo mudou) ou se
-- a análise em cache ainda é válida.
-- ============================================================

alter table public.meta_ad_creative_analysis
  add column if not exists analyzed_creative_id text;
