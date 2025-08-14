-- =====================================================
-- PARTNERS MEDIA BRAND ASSIGNMENT SETUP
-- =====================================================
-- Este script adiciona a funcionalidade de vincular usuários partners-media com marcas específicas
-- Execute este script no Supabase SQL Editor

-- =====================================================
-- 1. ADICIONAR COLUNA assigned_brand NA TABELA user_profiles
-- =====================================================

-- Adicionar coluna para vincular usuário com marca
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS assigned_brand TEXT;

-- Criar índice para melhor performance nas consultas por marca
CREATE INDEX IF NOT EXISTS idx_user_profiles_assigned_brand 
ON user_profiles(assigned_brand) 
WHERE assigned_brand IS NOT NULL;

-- Criar índice composto para role + marca
CREATE INDEX IF NOT EXISTS idx_user_profiles_role_brand 
ON user_profiles(role, assigned_brand) 
WHERE role = 'partners-media' AND assigned_brand IS NOT NULL;

-- =====================================================
-- 2. COMENTÁRIOS E DOCUMENTAÇÃO
-- =====================================================

COMMENT ON COLUMN user_profiles.assigned_brand IS 
'Marca atribuída ao usuário partners-media. Usado para filtrar produtos e pedidos por marca específica.';

-- =====================================================
-- 3. FUNÇÃO PARA OBTER MARCA DO USUÁRIO ATUAL
-- =====================================================

-- Função para obter a marca atribuída ao usuário atual
CREATE OR REPLACE FUNCTION get_user_assigned_brand()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT assigned_brand
  FROM user_profiles 
  WHERE id = auth.uid()
  AND role = 'partners-media'
  AND assigned_brand IS NOT NULL;
$$;

COMMENT ON FUNCTION get_user_assigned_brand() IS 
'Retorna a marca atribuída ao usuário partners-media atual, ou NULL se não for partners-media ou não tiver marca atribuída';

-- =====================================================
-- 4. FUNÇÃO PARA VERIFICAR SE USUÁRIO PODE VER MARCA
-- =====================================================

-- Função para verificar se o usuário atual pode ver dados de uma marca específica
CREATE OR REPLACE FUNCTION can_access_brand(target_brand TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT 
    CASE 
      -- Owners e admins podem ver todas as marcas
      WHEN EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE id = auth.uid() 
        AND role IN ('owner', 'admin')
      ) THEN TRUE
      
      -- Partners-media só podem ver sua marca atribuída
      WHEN EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE id = auth.uid() 
        AND role = 'partners-media'
        AND assigned_brand = target_brand
      ) THEN TRUE
      
      -- Outros roles (manager, user) podem ver todas as marcas
      WHEN EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE id = auth.uid() 
        AND role IN ('manager', 'user')
      ) THEN TRUE
      
      ELSE FALSE
    END;
$$;

COMMENT ON FUNCTION can_access_brand(TEXT) IS 
'Verifica se o usuário atual pode acessar dados de uma marca específica baseado em seu role e marca atribuída';

-- =====================================================
-- 5. FUNÇÃO PARA OBTER TODAS AS MARCAS DISPONÍVEIS
-- =====================================================

-- Função para obter lista de marcas disponíveis nos produtos
CREATE OR REPLACE FUNCTION get_available_brands()
RETURNS TABLE (
  brand TEXT,
  product_count BIGINT
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT 
    np.brand,
    COUNT(*) as product_count
  FROM nuvemshop_products np
  WHERE np.brand IS NOT NULL 
    AND np.brand != ''
    AND np.sync_status = 'synced'
  GROUP BY np.brand
  ORDER BY np.brand;
$$;

COMMENT ON FUNCTION get_available_brands() IS 
'Retorna lista de todas as marcas disponíveis nos produtos sincronizados com contagem de produtos por marca';

-- =====================================================
-- 6. ATUALIZAR POLÍTICAS RLS (se necessário)
-- =====================================================

-- As políticas RLS existentes devem continuar funcionando
-- pois a filtragem por marca será feita a nível de aplicação
-- usando as funções criadas acima

-- =====================================================
-- 7. EXEMPLO DE USO
-- =====================================================

-- Exemplo: Atribuir marca "Nike" ao usuário partners-media
-- UPDATE user_profiles 
-- SET assigned_brand = 'Nike' 
-- WHERE id = 'user-uuid-here' AND role = 'partners-media';

-- Exemplo: Verificar marca do usuário atual
-- SELECT get_user_assigned_brand();

-- Exemplo: Verificar se pode acessar marca "Adidas"
-- SELECT can_access_brand('Adidas');

-- Exemplo: Listar todas as marcas disponíveis
-- SELECT * FROM get_available_brands();
