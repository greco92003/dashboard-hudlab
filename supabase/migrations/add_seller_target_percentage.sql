-- =====================================================
-- ADICIONAR PORCENTAGEM DE META INDIVIDUAL POR VENDEDOR
-- =====================================================
-- Esta migration adiciona a capacidade de dividir a meta da empresa
-- entre os vendedores usando porcentagens.
-- Exemplo: Schay 70%, Raisa 30%

-- Adicionar coluna target_percentage na tabela ote_sellers
ALTER TABLE ote_sellers
ADD COLUMN IF NOT EXISTS target_percentage DECIMAL(5,2) DEFAULT 0 NOT NULL;

-- Comentário explicativo
COMMENT ON COLUMN ote_sellers.target_percentage IS 'Porcentagem da meta mensal da empresa que é meta deste vendedor (ex: 70.00 = 70%)';

-- Criar índice para facilitar consultas
CREATE INDEX IF NOT EXISTS idx_ote_sellers_active_target 
ON ote_sellers(active, target_percentage) 
WHERE active = true;

