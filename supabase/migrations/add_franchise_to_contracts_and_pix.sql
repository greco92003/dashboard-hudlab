-- =====================================================
-- ADICIONAR SUPORTE A FRANQUIAS EM CONTRATOS E CHAVES PIX
-- =====================================================
-- Permite múltiplos contratos e chaves pix por marca (um para cada franquia Zenith)

-- =====================================================
-- 1. ADICIONAR COLUNA FRANCHISE ÀS TABELAS
-- =====================================================

-- Adicionar coluna franchise à tabela partnership_contracts
ALTER TABLE partnership_contracts 
ADD COLUMN IF NOT EXISTS franchise TEXT;

-- Adicionar coluna franchise à tabela partner_pix_keys
ALTER TABLE partner_pix_keys 
ADD COLUMN IF NOT EXISTS franchise TEXT;

-- =====================================================
-- 2. CRIAR ÍNDICES PARA MELHOR PERFORMANCE
-- =====================================================

-- Índices para partnership_contracts
CREATE INDEX IF NOT EXISTS idx_partnership_contracts_brand_franchise 
ON partnership_contracts(brand, franchise);

CREATE INDEX IF NOT EXISTS idx_partnership_contracts_franchise 
ON partnership_contracts(franchise) 
WHERE franchise IS NOT NULL;

-- Índices para partner_pix_keys
CREATE INDEX IF NOT EXISTS idx_partner_pix_keys_brand_franchise 
ON partner_pix_keys(brand, franchise);

CREATE INDEX IF NOT EXISTS idx_partner_pix_keys_franchise 
ON partner_pix_keys(franchise) 
WHERE franchise IS NOT NULL;

-- =====================================================
-- 3. REMOVER CONSTRAINTS DE UNICIDADE ANTIGAS
-- =====================================================

-- Verificar e remover constraints que impedem múltiplos registros por marca
-- (se existirem)

-- Para partnership_contracts
DO $$ 
BEGIN
  -- Tentar remover constraint de unicidade por brand (se existir)
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname LIKE '%partnership_contracts%brand%unique%'
  ) THEN
    EXECUTE 'ALTER TABLE partnership_contracts DROP CONSTRAINT IF EXISTS partnership_contracts_brand_key';
  END IF;
END $$;

-- Para partner_pix_keys  
DO $$ 
BEGIN
  -- Tentar remover constraint de unicidade por brand (se existir)
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname LIKE '%partner_pix_keys%brand%unique%'
  ) THEN
    EXECUTE 'ALTER TABLE partner_pix_keys DROP CONSTRAINT IF EXISTS partner_pix_keys_brand_key';
  END IF;
END $$;

-- =====================================================
-- 4. CRIAR CONSTRAINTS DE UNICIDADE COMPOSTAS
-- =====================================================

-- Para partnership_contracts: URL única quando ativa
CREATE UNIQUE INDEX IF NOT EXISTS idx_partnership_contracts_unique_url 
ON partnership_contracts (contract_url) 
WHERE contract_url IS NOT NULL;

-- Para partnership_contracts: brand + franchise único (para Zenith)
CREATE UNIQUE INDEX IF NOT EXISTS idx_partnership_contracts_unique_brand_franchise 
ON partnership_contracts (brand, franchise) 
WHERE franchise IS NOT NULL;

-- Para partner_pix_keys: pix_key única
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_pix_keys_unique_key 
ON partner_pix_keys (pix_key) 
WHERE pix_key IS NOT NULL;

-- Para partner_pix_keys: brand + franchise único (para Zenith)
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_pix_keys_unique_brand_franchise 
ON partner_pix_keys (brand, franchise) 
WHERE franchise IS NOT NULL;

-- =====================================================
-- 5. ADICIONAR COMENTÁRIOS
-- =====================================================

COMMENT ON COLUMN partnership_contracts.franchise IS 
'Franquia Zenith associada ao contrato. NULL para outras marcas. Permite múltiplos contratos por marca (um por franquia).';

COMMENT ON COLUMN partner_pix_keys.franchise IS 
'Franquia Zenith associada à chave pix. NULL para outras marcas. Permite múltiplas chaves pix por marca (uma por franquia).';

-- =====================================================
-- 6. VERIFICAR RESULTADO
-- =====================================================

-- Ver estrutura das tabelas
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name IN ('partnership_contracts', 'partner_pix_keys')
  AND column_name IN ('brand', 'franchise')
ORDER BY table_name, ordinal_position;

-- Ver constraints e índices
SELECT 
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('partnership_contracts', 'partner_pix_keys')
  AND indexname LIKE '%unique%'
ORDER BY tablename, indexname;

