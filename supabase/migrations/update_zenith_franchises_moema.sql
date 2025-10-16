-- =====================================================
-- ATUALIZAR FRANQUIAS ZENITH - ADICIONAR MOEMA-SP
-- =====================================================
-- Esta migration atualiza o trigger para incluir a nova franquia Moema-SP
-- e aplica as mudanças no banco de dados

-- =====================================================
-- 1. ATUALIZAR FUNÇÃO TRIGGER COM NOVA FRANQUIA
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

    -- Verificar se já existe link de afiliado para esta marca
    SELECT NOT EXISTS (
      SELECT 1
      FROM affiliate_links
      WHERE brand = NEW.brand
      AND is_active = true
    ) INTO is_new_brand;

    -- Se é uma nova marca, criar link de afiliado
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
-- 2. COMENTÁRIOS
-- =====================================================

COMMENT ON FUNCTION trigger_auto_affiliate_link_on_new_brand() IS
'Função trigger que detecta quando uma nova marca é adicionada e gera link de afiliado automaticamente. Para marca Zenith, cria um link para cada franquia (Santos-SP, Garopaba-SC, Taquara-RS, Moema-SP)';

-- =====================================================
-- 3. VERIFICAR RESULTADO
-- =====================================================

-- Ver todas as franquias Zenith
SELECT 
  id,
  brand,
  url,
  CASE 
    WHEN url LIKE '%Santos-SP%' THEN '✅ Santos-SP'
    WHEN url LIKE '%Garopaba-SC%' THEN '✅ Garopaba-SC'
    WHEN url LIKE '%Taquara-RS%' THEN '✅ Taquara-RS'
    WHEN url LIKE '%Moema-SP%' THEN '✅ Moema-SP'
    ELSE '❌ SEM FRANQUIA'
  END as franchise,
  is_active,
  created_at
FROM affiliate_links
WHERE brand ILIKE '%zenith%'
ORDER BY is_active DESC, created_at DESC;

