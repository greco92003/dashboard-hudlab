-- =====================================================
-- CORREÇÃO DO SISTEMA DE CUPONS AUTOMÁTICOS
-- =====================================================
-- Remove o trigger HTTP que causa timeout e implementa processamento assíncrono

-- =====================================================
-- 1. REMOVER TRIGGER HTTP PROBLEMÁTICO
-- =====================================================

-- Remover trigger que faz chamadas HTTP síncronas
DROP TRIGGER IF EXISTS trigger_process_coupon_nuvemshop ON generated_coupons;

-- Remover função que faz chamadas HTTP síncronas
DROP FUNCTION IF EXISTS process_coupon_in_nuvemshop();

-- =====================================================
-- 2. MANTER APENAS O TRIGGER DE CRIAÇÃO AUTOMÁTICA
-- =====================================================

-- Verificar se a função de criação automática existe
CREATE OR REPLACE FUNCTION trigger_auto_coupon_on_new_brand()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  is_new_brand BOOLEAN := FALSE;
  coupon_code_generated TEXT;
  first_word TEXT;
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
    
    -- Se for uma marca nova, gerar cupom automaticamente
    IF is_new_brand THEN
      -- Gerar código do cupom (primeira palavra + "15")
      first_word := UPPER(SPLIT_PART(TRIM(NEW.brand), ' ', 1));
      coupon_code_generated := first_word || '15';
      
      -- Verificar se o código já existe
      IF NOT EXISTS (SELECT 1 FROM generated_coupons WHERE code = coupon_code_generated) THEN
        -- Inserir cupom pendente (será processado assincronamente)
        INSERT INTO generated_coupons (
          code,
          percentage,
          brand,
          valid_until,
          max_uses,
          created_by_brand,
          nuvemshop_status,
          is_auto_generated,
          created_at
        ) VALUES (
          coupon_code_generated,
          15,
          NEW.brand,
          (CURRENT_DATE + INTERVAL '1 year')::DATE,
          NULL, -- Unlimited uses
          NEW.brand,
          'pending', -- Será processado por endpoint separado
          true,
          NOW()
        )
        ON CONFLICT (code) DO NOTHING; -- Evitar duplicatas

        RAISE NOTICE 'Cupom automático pendente criado para marca %: %', NEW.brand, coupon_code_generated;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Garantir que o trigger de criação automática está ativo
DROP TRIGGER IF EXISTS trigger_auto_coupon_new_brand ON nuvemshop_products;

CREATE TRIGGER trigger_auto_coupon_new_brand
  AFTER INSERT OR UPDATE ON nuvemshop_products
  FOR EACH ROW
  EXECUTE FUNCTION trigger_auto_coupon_on_new_brand();

-- =====================================================
-- 3. COMENTÁRIOS E DOCUMENTAÇÃO
-- =====================================================

COMMENT ON FUNCTION trigger_auto_coupon_on_new_brand() IS 
'Função trigger que detecta quando uma nova marca é adicionada e cria cupom automático com status pending para processamento assíncrono';

COMMENT ON TRIGGER trigger_auto_coupon_new_brand ON nuvemshop_products IS 
'Trigger que cria cupons automáticos para novas marcas. Os cupons ficam pendentes e são processados por endpoint separado.';

-- =====================================================
-- 4. VERIFICAÇÃO
-- =====================================================

-- Verificar se o trigger foi criado corretamente
SELECT 
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers 
WHERE trigger_name = 'trigger_auto_coupon_new_brand'
  AND event_object_table = 'nuvemshop_products';

-- Verificar cupons pendentes que precisam ser processados
SELECT 
  code,
  brand,
  nuvemshop_status,
  created_at
FROM generated_coupons 
WHERE nuvemshop_status = 'pending'
  AND is_auto_generated = true
ORDER BY created_at DESC
LIMIT 10;
