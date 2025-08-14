-- =====================================================
-- PARTNERS MEDIA ROLE SETUP
-- =====================================================
-- Este script adiciona o novo role "partners-media" ao sistema
-- Execute este script no Supabase SQL Editor

-- =====================================================
-- 1. ATUALIZAR CONSTRAINT DA TABELA user_profiles
-- =====================================================

-- Primeiro, remover a constraint existente
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;

-- Adicionar nova constraint incluindo partners-media
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check 
CHECK (role IN ('owner', 'admin', 'manager', 'partners-media', 'user'));

-- =====================================================
-- 2. CRIAR FUNÇÃO PARA VERIFICAR ROLE PARTNERS-MEDIA
-- =====================================================

-- Função para verificar se o usuário atual é partners-media
CREATE OR REPLACE FUNCTION is_partners_media()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM user_profiles 
    WHERE id = auth.uid() 
    AND role = 'partners-media'
  );
$$;

-- =====================================================
-- 3. ATUALIZAR FUNÇÃO has_role PARA INCLUIR PARTNERS-MEDIA
-- =====================================================

-- Atualizar função has_role para incluir o novo role
CREATE OR REPLACE FUNCTION has_role(required_role TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM user_profiles 
    WHERE id = auth.uid() 
    AND role = required_role
  );
$$;

-- =====================================================
-- 4. CRIAR FUNÇÃO PARA VERIFICAR HIERARQUIA DE ROLES
-- =====================================================

-- Função para obter o nível hierárquico do role
CREATE OR REPLACE FUNCTION get_role_level(user_role TEXT)
RETURNS INTEGER
LANGUAGE SQL
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT CASE user_role
    WHEN 'owner' THEN 5
    WHEN 'admin' THEN 4
    WHEN 'manager' THEN 3
    WHEN 'partners-media' THEN 2
    WHEN 'user' THEN 1
    ELSE 0
  END;
$$;

-- Função para verificar se o usuário atual pode gerenciar outro role
CREATE OR REPLACE FUNCTION can_manage_role(target_role TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT 
    CASE 
      WHEN NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid()) THEN FALSE
      ELSE (
        SELECT get_role_level(role) > get_role_level(target_role)
        FROM user_profiles 
        WHERE id = auth.uid()
      )
    END;
$$;

-- =====================================================
-- 5. ATUALIZAR POLÍTICAS RLS (se necessário)
-- =====================================================

-- As políticas existentes já devem funcionar com o novo role
-- pois usam funções como is_owner_or_admin() que não precisam ser alteradas

-- =====================================================
-- 6. COMENTÁRIOS E DOCUMENTAÇÃO
-- =====================================================

-- Adicionar comentários para documentar o novo role
COMMENT ON CONSTRAINT user_profiles_role_check ON user_profiles IS 
'Constraint que define os roles válidos: owner, admin, manager, partners-media, user';

COMMENT ON FUNCTION is_partners_media() IS 
'Verifica se o usuário atual tem o role partners-media';

COMMENT ON FUNCTION get_role_level(TEXT) IS 
'Retorna o nível hierárquico do role (5=owner, 4=admin, 3=manager, 2=partners-media, 1=user)';

COMMENT ON FUNCTION can_manage_role(TEXT) IS 
'Verifica se o usuário atual pode gerenciar um determinado role baseado na hierarquia';

-- =====================================================
-- 7. VERIFICAÇÃO FINAL
-- =====================================================

-- Verificar se as funções foram criadas corretamente
SELECT 
  routine_name,
  routine_type
FROM information_schema.routines 
WHERE routine_name IN ('is_partners_media', 'get_role_level', 'can_manage_role')
AND routine_schema = 'public';

-- Verificar constraint da tabela
SELECT 
  constraint_name,
  check_clause
FROM information_schema.check_constraints 
WHERE constraint_name = 'user_profiles_role_check';

-- =====================================================
-- SUCESSO!
-- =====================================================
-- Se chegou até aqui sem erros, o role partners-media foi
-- configurado com sucesso no sistema.
--
-- Próximos passos:
-- 1. Testar a atribuição do role via interface
-- 2. Verificar permissões e hierarquia
-- 3. Documentar o uso do novo role
-- =====================================================
