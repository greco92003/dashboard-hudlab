-- =====================================================
-- TEAM LEADER ROLE SETUP
-- =====================================================
-- Este script adiciona o novo role "team-leader" ao sistema
-- Execute este script no Supabase SQL Editor

-- =====================================================
-- 1. ATUALIZAR CONSTRAINT DA TABELA user_profiles
-- =====================================================

-- Primeiro, remover a constraint existente
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;

-- Adicionar nova constraint incluindo team-leader
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check 
CHECK (role IN ('owner', 'admin', 'manager', 'team-leader', 'partners-media', 'user'));

-- =====================================================
-- 2. ADICIONAR CAMPO setor_liderado
-- =====================================================

-- Adicionar coluna setor_liderado (qual setor o team leader gerencia)
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS setor_liderado TEXT 
CHECK (setor_liderado IN ('design', 'comercial', 'financeiro', 'marketing', 'rh'));

-- =====================================================
-- 3. CRIAR FUNÇÃO PARA VERIFICAR ROLE TEAM-LEADER
-- =====================================================

CREATE OR REPLACE FUNCTION is_team_leader()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM user_profiles 
    WHERE id = auth.uid() 
    AND role = 'team-leader'
  );
$$;

-- =====================================================
-- 4. ATUALIZAR FUNÇÃO get_role_level PARA INCLUIR TEAM-LEADER
-- =====================================================

-- Hierarquia atualizada: owner(6) > admin(5) > manager(4) > team-leader(3) > partners-media(2) > user(1)
CREATE OR REPLACE FUNCTION get_role_level(user_role TEXT)
RETURNS INTEGER
LANGUAGE SQL
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT CASE user_role
    WHEN 'owner' THEN 6
    WHEN 'admin' THEN 5
    WHEN 'manager' THEN 4
    WHEN 'team-leader' THEN 3
    WHEN 'partners-media' THEN 2
    WHEN 'user' THEN 1
    ELSE 0
  END;
$$;

-- =====================================================
-- 5. ATUALIZAR FUNÇÃO can_manage_role
-- =====================================================

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
-- 6. CRIAR FUNÇÃO AUXILIAR PARA OBTER SETOR DO TEAM LEADER
-- =====================================================

CREATE OR REPLACE FUNCTION get_team_leader_setor()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT setor_liderado
  FROM user_profiles 
  WHERE id = auth.uid() 
  AND role = 'team-leader'
  LIMIT 1;
$$;

-- =====================================================
-- 7. COMENTÁRIOS E DOCUMENTAÇÃO
-- =====================================================

COMMENT ON CONSTRAINT user_profiles_role_check ON user_profiles IS 
'Roles válidos: owner, admin, manager, team-leader, partners-media, user';

COMMENT ON COLUMN user_profiles.setor_liderado IS
'Setor gerenciado pelo team leader. Valores: design, comercial, financeiro, marketing, rh';

COMMENT ON FUNCTION is_team_leader() IS 
'Verifica se o usuário atual tem o role team-leader';

COMMENT ON FUNCTION get_role_level(TEXT) IS 
'Retorna nível hierárquico: owner=6, admin=5, manager=4, team-leader=3, partners-media=2, user=1';

COMMENT ON FUNCTION get_team_leader_setor() IS 
'Retorna o setor gerenciado pelo team leader atual';

-- =====================================================
-- 8. VERIFICAÇÃO FINAL
-- =====================================================

SELECT 
  routine_name,
  routine_type
FROM information_schema.routines 
WHERE routine_name IN ('is_team_leader', 'get_role_level', 'can_manage_role', 'get_team_leader_setor')
AND routine_schema = 'public';

SELECT 
  constraint_name,
  check_clause
FROM information_schema.check_constraints 
WHERE constraint_name = 'user_profiles_role_check';

SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'user_profiles' AND column_name = 'setor_liderado';

-- =====================================================
-- SUCESSO!
-- =====================================================
-- O role team-leader foi configurado com sucesso.
-- Hierarquia: owner(6) > admin(5) > manager(4) > team-leader(3) > partners-media(2) > user(1)
-- =====================================================

