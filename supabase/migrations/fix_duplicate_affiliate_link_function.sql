-- =====================================================
-- FIX: Remove duplicate generate_auto_affiliate_link_for_brand function
-- =====================================================
-- Este script corrige o erro "function generate_auto_affiliate_link_for_brand(text) is not unique"
-- removendo todas as versões da função e recriando apenas a versão correta

-- =====================================================
-- 1. REMOVER TODAS AS VERSÕES DA FUNÇÃO
-- =====================================================

-- Drop all possible versions of the function
DROP FUNCTION IF EXISTS generate_auto_affiliate_link_for_brand(TEXT);
DROP FUNCTION IF EXISTS generate_auto_affiliate_link_for_brand(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.generate_auto_affiliate_link_for_brand(TEXT);
DROP FUNCTION IF EXISTS public.generate_auto_affiliate_link_for_brand(TEXT, TEXT);

-- =====================================================
-- 2. RECRIAR A FUNÇÃO CORRETA (com 2 parâmetros)
-- =====================================================

CREATE OR REPLACE FUNCTION generate_auto_affiliate_link_for_brand(brand_name TEXT, franchise_name TEXT DEFAULT NULL)
RETURNS TABLE (
  affiliate_url TEXT,
  affiliate_id UUID,
  success BOOLEAN,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  new_affiliate_id UUID;
  affiliate_url TEXT;
  admin_user_id UUID;
  is_zenith BOOLEAN;
  franchise_suffix TEXT;
BEGIN
  -- Validar entrada
  IF brand_name IS NULL OR TRIM(brand_name) = '' THEN
    RETURN QUERY SELECT
      NULL::TEXT as affiliate_url,
      NULL::UUID as affiliate_id,
      FALSE as success,
      'Nome da marca não pode estar vazio' as error_message;
    RETURN;
  END IF;

  -- Verificar se é marca Zenith
  is_zenith := LOWER(TRIM(brand_name)) = 'zenith';

  -- Se for Zenith e não tiver franquia especificada, retornar erro
  IF is_zenith AND (franchise_name IS NULL OR TRIM(franchise_name) = '') THEN
    RETURN QUERY SELECT
      NULL::TEXT as affiliate_url,
      NULL::UUID as affiliate_id,
      FALSE as success,
      'Para marca Zenith, é necessário especificar a franquia' as error_message;
    RETURN;
  END IF;

  -- Verificar se já existe um link ativo para esta marca (e franquia, se aplicável)
  IF EXISTS (
    SELECT 1 FROM affiliate_links
    WHERE brand = brand_name
    AND is_active = true
    AND (
      (NOT is_zenith) OR
      (is_zenith AND url LIKE '%' || REPLACE(TRIM(franchise_name), ' ', '-') || '%')
    )
  ) THEN
    RETURN QUERY SELECT
      NULL::TEXT as affiliate_url,
      NULL::UUID as affiliate_id,
      FALSE as success,
      'Já existe um link de afiliado ativo para esta marca' ||
      CASE WHEN is_zenith THEN ' e franquia' ELSE '' END as error_message;
    RETURN;
  END IF;

  -- Gerar URL do link de afiliado
  IF is_zenith THEN
    -- Para Zenith, incluir o nome da franquia
    franchise_suffix := REPLACE(TRIM(franchise_name), ' ', '-');
    affiliate_url := 'https://hudlab.com.br/?utm_source=LandingPage&utm_medium=' ||
                     REPLACE(TRIM(brand_name), ' ', '-') || '-' || franchise_suffix;
  ELSE
    -- Para outras marcas, apenas o nome da marca
    affiliate_url := 'https://hudlab.com.br/?utm_source=LandingPage&utm_medium=' ||
                     REPLACE(TRIM(brand_name), ' ', '-');
  END IF;

  -- Buscar um usuário admin/owner para ser o criador
  SELECT id INTO admin_user_id
  FROM auth.users
  JOIN user_profiles ON auth.users.id = user_profiles.id
  WHERE user_profiles.role IN ('admin', 'owner')
  AND user_profiles.approved = true
  LIMIT 1;

  -- Se não encontrar admin/owner, usar o primeiro usuário disponível
  IF admin_user_id IS NULL THEN
    SELECT id INTO admin_user_id
    FROM auth.users
    LIMIT 1;
  END IF;

  -- Criar o link de afiliado
  INSERT INTO affiliate_links (
    url,
    brand,
    created_by,
    is_active
  ) VALUES (
    affiliate_url,
    brand_name,
    admin_user_id,
    true
  )
  RETURNING id INTO new_affiliate_id;

  -- Retornar sucesso
  RETURN QUERY SELECT
    affiliate_url as affiliate_url,
    new_affiliate_id as affiliate_id,
    TRUE as success,
    NULL::TEXT as error_message;

EXCEPTION
  WHEN OTHERS THEN
    -- Em caso de erro, retornar informações do erro
    RETURN QUERY SELECT
      NULL::TEXT as affiliate_url,
      NULL::UUID as affiliate_id,
      FALSE as success,
      SQLERRM as error_message;
END;
$$;

-- =====================================================
-- 3. ADICIONAR COMENTÁRIO
-- =====================================================

COMMENT ON FUNCTION generate_auto_affiliate_link_for_brand(TEXT, TEXT) IS
'Gera automaticamente um link de afiliado para uma nova marca. Para marcas Zenith, inclui o nome da franquia no formato "https://hudlab.com.br/?utm_source=LandingPage&utm_medium=Zenith-FRANQUIA". Para outras marcas: "https://hudlab.com.br/?utm_source=LandingPage&utm_medium=NOME-DA-MARCA"';

