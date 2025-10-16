-- =====================================================
-- SISTEMA DE GERAÇÃO AUTOMÁTICA DE LINKS DE AFILIADO PARA NOVAS MARCAS
-- =====================================================
-- Este script implementa a geração automática de links de afiliado quando uma nova marca é adicionada

-- =====================================================
-- 1. FUNÇÃO PARA GERAR LINK DE AFILIADO AUTOMÁTICO PARA NOVA MARCA
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
-- 2. FUNÇÃO TRIGGER PARA DETECTAR NOVAS MARCAS
-- =====================================================

CREATE OR REPLACE FUNCTION trigger_auto_affiliate_link_on_new_brand()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  is_new_brand BOOLEAN := FALSE;
  is_zenith BOOLEAN := FALSE;
  affiliate_result RECORD;
  franchise_names TEXT[] := ARRAY['Santos-SP', 'Garopaba-SC', 'Taquara-RS', 'Moema-SP'];
  franchise_name TEXT;
BEGIN
  -- Verificar se é uma nova marca (não existia antes com produtos publicados)
  IF NEW.brand IS NOT NULL
     AND NEW.brand != ''
     AND NEW.published = true
     AND NEW.sync_status = 'synced' THEN

    -- Verificar se é realmente uma marca nova
    IF NOT EXISTS (
      SELECT 1 FROM nuvemshop_products
      WHERE brand = NEW.brand
        AND published = true
        AND sync_status = 'synced'
        AND id != NEW.id -- Excluir o registro atual
    ) THEN
      is_new_brand := TRUE;
    END IF;

    -- Se for uma marca nova, gerar link de afiliado automaticamente
    IF is_new_brand THEN
      -- Verificar se é marca Zenith
      is_zenith := LOWER(TRIM(NEW.brand)) = 'zenith';

      IF is_zenith THEN
        -- Para Zenith, criar um link para cada franquia
        FOREACH franchise_name IN ARRAY franchise_names
        LOOP
          SELECT * INTO affiliate_result
          FROM generate_auto_affiliate_link_for_brand(NEW.brand, franchise_name);

          -- Log do resultado
          IF affiliate_result.success THEN
            RAISE NOTICE 'Link de afiliado automático criado para marca % - franquia %: %',
              NEW.brand, franchise_name, affiliate_result.affiliate_url;
          ELSE
            RAISE NOTICE 'Falha ao criar link de afiliado automático para marca % - franquia %: %',
              NEW.brand, franchise_name, affiliate_result.error_message;
          END IF;
        END LOOP;
      ELSE
        -- Para outras marcas, criar apenas um link
        SELECT * INTO affiliate_result
        FROM generate_auto_affiliate_link_for_brand(NEW.brand);

        -- Log do resultado
        IF affiliate_result.success THEN
          RAISE NOTICE 'Link de afiliado automático criado para marca %: %', NEW.brand, affiliate_result.affiliate_url;
        ELSE
          RAISE NOTICE 'Falha ao criar link de afiliado automático para marca %: %', NEW.brand, affiliate_result.error_message;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- =====================================================
-- 3. CRIAR TRIGGER NA TABELA nuvemshop_products
-- =====================================================

-- Remover trigger existente se houver
DROP TRIGGER IF EXISTS trigger_auto_affiliate_link_new_brand ON nuvemshop_products;

-- Criar novo trigger
CREATE TRIGGER trigger_auto_affiliate_link_new_brand
  AFTER INSERT OR UPDATE ON nuvemshop_products
  FOR EACH ROW
  EXECUTE FUNCTION trigger_auto_affiliate_link_on_new_brand();

-- =====================================================
-- 4. COMENTÁRIOS E DOCUMENTAÇÃO
-- =====================================================

COMMENT ON FUNCTION generate_auto_affiliate_link_for_brand(TEXT, TEXT) IS
'Gera automaticamente um link de afiliado para uma nova marca. Para marcas Zenith, inclui o nome da franquia no formato "https://hudlab.com.br/?utm_source=LandingPage&utm_medium=Zenith-FRANQUIA". Para outras marcas: "https://hudlab.com.br/?utm_source=LandingPage&utm_medium=NOME-DA-MARCA"';

COMMENT ON FUNCTION trigger_auto_affiliate_link_on_new_brand() IS
'Função trigger que detecta quando uma nova marca é adicionada e gera link de afiliado automaticamente. Para marca Zenith, cria um link para cada franquia (Santos-SP, Garopaba-SC, Taquara-RS)';

-- =====================================================
-- 5. EXEMPLOS DE USO
-- =====================================================

-- Exemplo: Gerar link manualmente para uma marca comum
-- SELECT * FROM generate_auto_affiliate_link_for_brand('Nike Air Jordan');

-- Exemplo: Gerar link manualmente para marca Zenith com franquia
-- SELECT * FROM generate_auto_affiliate_link_for_brand('Zenith', 'Taquara-RS');

-- Para verificar links gerados automaticamente:
-- SELECT url, brand, created_at
-- FROM affiliate_links
-- WHERE brand IS NOT NULL
-- ORDER BY created_at DESC;
