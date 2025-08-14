-- =====================================================
-- SISTEMA DE GERAÇÃO AUTOMÁTICA DE CUPONS PARA NOVAS MARCAS
-- =====================================================
-- Este script implementa a geração automática de cupons quando uma nova marca é adicionada

-- =====================================================
-- 1. FUNÇÃO PARA GERAR CUPOM AUTOMÁTICO PARA NOVA MARCA
-- =====================================================

CREATE OR REPLACE FUNCTION generate_auto_coupon_for_brand(brand_name TEXT)
RETURNS TABLE (
  coupon_code TEXT,
  coupon_id UUID,
  success BOOLEAN,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  first_name TEXT;
  coupon_code_generated TEXT;
  new_coupon_id UUID;
  valid_until_date TIMESTAMP WITH TIME ZONE;
  brand_products INTEGER;
BEGIN
  -- Verificar se a marca tem produtos publicados
  SELECT COUNT(*) INTO brand_products
  FROM nuvemshop_products 
  WHERE brand = brand_name 
    AND published = true 
    AND sync_status = 'synced';
    
  IF brand_products = 0 THEN
    RETURN QUERY SELECT 
      NULL::TEXT as coupon_code,
      NULL::UUID as coupon_id,
      FALSE as success,
      'Marca não possui produtos publicados' as error_message;
    RETURN;
  END IF;

  -- Verificar se já existe cupom para esta marca
  IF EXISTS (
    SELECT 1 FROM generated_coupons 
    WHERE brand = brand_name 
      AND is_active = true
      AND code LIKE '%15'
  ) THEN
    RETURN QUERY SELECT 
      NULL::TEXT as coupon_code,
      NULL::UUID as coupon_id,
      FALSE as success,
      'Já existe cupom automático para esta marca' as error_message;
    RETURN;
  END IF;

  -- Extrair primeiro nome da marca (até o primeiro espaço ou hífen)
  first_name := LOWER(TRIM(SPLIT_PART(SPLIT_PART(brand_name, ' ', 1), '-', 1)));
  
  -- Remover caracteres especiais e manter apenas letras e números
  first_name := REGEXP_REPLACE(first_name, '[^a-z0-9]', '', 'g');
  
  -- Garantir que tenha pelo menos 3 caracteres
  IF LENGTH(first_name) < 3 THEN
    first_name := SUBSTRING(REGEXP_REPLACE(LOWER(brand_name), '[^a-z0-9]', '', 'g'), 1, 6);
  END IF;
  
  -- Gerar código do cupom: PRIMEIRNOME15 (maiúscula, sem traço)
  coupon_code_generated := UPPER(first_name) || '15';

  -- Se o código já existir, adicionar número sequencial
  WHILE EXISTS (SELECT 1 FROM generated_coupons WHERE code = coupon_code_generated) LOOP
    coupon_code_generated := UPPER(first_name) || '15' || EXTRACT(EPOCH FROM NOW())::INTEGER;
  END LOOP;
  
  -- Definir data de validade (1 ano a partir de hoje)
  valid_until_date := NOW() + INTERVAL '1 year';
  
  -- Criar cupom na tabela (usando o primeiro admin/owner como created_by)
  INSERT INTO generated_coupons (
    code,
    percentage,
    brand,
    valid_until,
    max_uses,
    created_by,
    created_by_brand,
    nuvemshop_status,
    is_active,
    is_auto_generated
  ) VALUES (
    coupon_code_generated,
    15, -- 15% de desconto
    brand_name,
    valid_until_date,
    NULL, -- Usos ilimitados
    (SELECT id FROM auth.users
     JOIN user_profiles ON auth.users.id = user_profiles.id
     WHERE user_profiles.role IN ('admin', 'owner')
     AND user_profiles.approved = true
     LIMIT 1), -- Usar o primeiro admin/owner como criador
    brand_name,
    'pending',
    true,
    true -- Marcar como cupom automático
  ) RETURNING id INTO new_coupon_id;
  
  -- Retornar resultado de sucesso
  RETURN QUERY SELECT
    coupon_code_generated as coupon_code,
    new_coupon_id as coupon_id,
    TRUE as success,
    NULL::TEXT as error_message;
    
EXCEPTION
  WHEN OTHERS THEN
    -- Em caso de erro, retornar informações do erro
    RETURN QUERY SELECT 
      NULL::TEXT as coupon_code,
      NULL::UUID as coupon_id,
      FALSE as success,
      SQLERRM as error_message;
END;
$$;

-- =====================================================
-- 2. FUNÇÃO TRIGGER PARA DETECTAR NOVAS MARCAS
-- =====================================================

CREATE OR REPLACE FUNCTION trigger_auto_coupon_on_new_brand()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  is_new_brand BOOLEAN := FALSE;
  coupon_result RECORD;
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

    -- Se for uma marca nova, chamar a API para criar o cupom corretamente
    IF is_new_brand THEN
      -- Usar a mesma lógica da API auto-generate para manter consistência
      -- Criar cupom com formato correto: PRIMEIRNOME15 (sem traço)
      DECLARE
        coupon_code_generated TEXT;
        first_word TEXT;
      BEGIN
        -- Extrair primeira palavra da marca e converter para maiúscula
        first_word := UPPER(SPLIT_PART(TRIM(NEW.brand), ' ', 1));
        coupon_code_generated := first_word || '15';

        -- Inserir cupom com formato correto (sem traço)
        INSERT INTO generated_coupons (
          code,
          percentage,
          brand,
          valid_until,
          max_uses,
          created_by,
          created_by_brand,
          nuvemshop_status,
          is_active,
          is_auto_generated
        ) VALUES (
          coupon_code_generated,
          15,
          NEW.brand,
          (CURRENT_DATE + INTERVAL '1 year')::timestamp,
          NULL, -- Usos ilimitados
          (SELECT id FROM auth.users
           JOIN user_profiles ON auth.users.id = user_profiles.id
           WHERE user_profiles.role IN ('admin', 'owner')
           AND user_profiles.approved = true
           LIMIT 1),
          NEW.brand,
          'pending', -- Será processado pela API
          true,
          true -- Marcar como cupom automático
        )
        ON CONFLICT (code) DO NOTHING; -- Evitar duplicatas

        RAISE NOTICE 'Cupom automático pendente criado para marca %: %', NEW.brand, coupon_code_generated;
      END;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- =====================================================
-- 3. CRIAR TRIGGER NA TABELA nuvemshop_products
-- =====================================================

-- Remover trigger existente se houver
DROP TRIGGER IF EXISTS trigger_auto_coupon_new_brand ON nuvemshop_products;

-- Criar novo trigger
CREATE TRIGGER trigger_auto_coupon_new_brand
  AFTER INSERT OR UPDATE ON nuvemshop_products
  FOR EACH ROW
  EXECUTE FUNCTION trigger_auto_coupon_on_new_brand();

-- =====================================================
-- 4. COMENTÁRIOS E DOCUMENTAÇÃO
-- =====================================================

COMMENT ON FUNCTION generate_auto_coupon_for_brand(TEXT) IS
'Gera automaticamente um cupom de 15% de desconto para uma nova marca com formato "PRIMEIRNOME15"';

COMMENT ON FUNCTION trigger_auto_coupon_on_new_brand() IS 
'Função trigger que detecta quando uma nova marca é adicionada e gera cupom automaticamente';

-- =====================================================
-- 5. EXEMPLOS DE USO
-- =====================================================

-- Exemplo: Gerar cupom manualmente para uma marca
-- SELECT * FROM generate_auto_coupon_for_brand('Nike Air Jordan');

-- Exemplo: Verificar cupons gerados automaticamente
-- SELECT code, brand, percentage, valid_until, created_at 
-- FROM generated_coupons 
-- WHERE created_by_brand IS NOT NULL 
-- ORDER BY created_at DESC;
