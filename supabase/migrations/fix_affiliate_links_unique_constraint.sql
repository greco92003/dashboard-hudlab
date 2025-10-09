-- =====================================================
-- FIX: Permitir múltiplos links ativos por marca (para franquias Zenith)
-- =====================================================
-- A constraint atual permite apenas 1 link ativo por marca
-- Precisamos mudar para permitir múltiplos links, desde que as URLs sejam diferentes

-- 1. Verificar a constraint atual
SELECT 
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'affiliate_links'::regclass
  AND conname LIKE '%unique%';

-- 2. Remover a constraint antiga que impede múltiplos links por marca
DROP INDEX IF EXISTS idx_affiliate_links_unique_brand_active;

-- 3. Criar nova constraint que permite múltiplos links por marca
-- mas garante que cada URL seja única quando ativa
CREATE UNIQUE INDEX idx_affiliate_links_unique_url_active 
ON affiliate_links (url) 
WHERE is_active = true;

-- 4. Adicionar índice para melhorar performance de busca por marca
CREATE INDEX IF NOT EXISTS idx_affiliate_links_brand_active_url 
ON affiliate_links (brand, is_active, url);

-- 5. Verificar resultado
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'affiliate_links'
  AND indexname LIKE '%unique%';

-- 6. Comentários
COMMENT ON INDEX idx_affiliate_links_unique_url_active IS 
'Garante que cada URL seja única quando ativa. Permite múltiplos links ativos por marca (necessário para franquias Zenith).';

-- =====================================================
-- TESTE: Verificar se agora permite múltiplos links para Zenith
-- =====================================================

-- Verificar quantos links ativos a Zenith tem
SELECT 
  brand,
  COUNT(*) as total_active_links,
  array_agg(url) as urls
FROM affiliate_links
WHERE brand ILIKE '%zenith%'
  AND is_active = true
GROUP BY brand;

-- Resultado esperado: Zenith deve poder ter 3 links ativos (um por franquia)

