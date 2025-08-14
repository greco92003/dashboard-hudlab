-- =====================================================
-- SCRIPT PARA CORRIGIR CUPONS AUTOMÁTICOS EXISTENTES
-- =====================================================
-- Este script corrige cupons criados com formato incorreto (primeirnome-15)
-- para o formato correto (PRIMEIRNOME15)

-- =====================================================
-- 1. IDENTIFICAR CUPONS COM FORMATO INCORRETO
-- =====================================================

-- Listar cupons que precisam ser corrigidos
SELECT 
  id,
  code,
  brand,
  percentage,
  nuvemshop_coupon_id,
  nuvemshop_status,
  created_at
FROM generated_coupons 
WHERE code LIKE '%-%' 
  AND code LIKE '%15'
  AND percentage = 15
ORDER BY created_at DESC;

-- =====================================================
-- 2. FUNÇÃO PARA CORRIGIR FORMATO DOS CUPONS
-- =====================================================

CREATE OR REPLACE FUNCTION fix_auto_coupon_format()
RETURNS TABLE (
  old_code TEXT,
  new_code TEXT,
  brand_name TEXT,
  coupon_id UUID,
  success BOOLEAN,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  coupon_record RECORD;
  new_coupon_code TEXT;
  first_word TEXT;
  update_count INTEGER := 0;
BEGIN
  -- Processar cada cupom com formato incorreto
  FOR coupon_record IN 
    SELECT id, code, brand, nuvemshop_coupon_id, nuvemshop_status
    FROM generated_coupons 
    WHERE code LIKE '%-%' 
      AND code LIKE '%15'
      AND percentage = 15
  LOOP
    BEGIN
      -- Extrair primeira palavra da marca e gerar novo código
      first_word := UPPER(SPLIT_PART(TRIM(coupon_record.brand), ' ', 1));
      new_coupon_code := first_word || '15';
      
      -- Verificar se o novo código já existe
      IF EXISTS (SELECT 1 FROM generated_coupons WHERE code = new_coupon_code AND id != coupon_record.id) THEN
        -- Se já existe, adicionar timestamp para tornar único
        new_coupon_code := first_word || '15' || EXTRACT(EPOCH FROM NOW())::INTEGER;
      END IF;
      
      -- Atualizar o código do cupom
      UPDATE generated_coupons 
      SET 
        code = new_coupon_code,
        updated_at = NOW()
      WHERE id = coupon_record.id;
      
      update_count := update_count + 1;
      
      -- Retornar resultado de sucesso
      RETURN QUERY SELECT 
        coupon_record.code as old_code,
        new_coupon_code as new_code,
        coupon_record.brand as brand_name,
        coupon_record.id as coupon_id,
        TRUE as success,
        NULL::TEXT as error_message;
        
    EXCEPTION WHEN OTHERS THEN
      -- Retornar erro se algo deu errado
      RETURN QUERY SELECT 
        coupon_record.code as old_code,
        NULL::TEXT as new_code,
        coupon_record.brand as brand_name,
        coupon_record.id as coupon_id,
        FALSE as success,
        SQLERRM as error_message;
    END;
  END LOOP;
  
  RAISE NOTICE 'Corrigidos % cupons automáticos', update_count;
END;
$$;

-- =====================================================
-- 3. EXECUTAR CORREÇÃO DOS CUPONS
-- =====================================================

-- Executar a função para corrigir os cupons
SELECT * FROM fix_auto_coupon_format();

-- =====================================================
-- 4. VERIFICAR RESULTADOS
-- =====================================================

-- Verificar se ainda existem cupons com formato incorreto
SELECT 
  COUNT(*) as cupons_com_formato_incorreto
FROM generated_coupons 
WHERE code LIKE '%-%' 
  AND code LIKE '%15'
  AND percentage = 15;

-- Listar cupons corrigidos
SELECT 
  id,
  code,
  brand,
  percentage,
  nuvemshop_status,
  updated_at
FROM generated_coupons 
WHERE percentage = 15
  AND code NOT LIKE '%-%'
  AND code LIKE '%15'
ORDER BY updated_at DESC;

-- =====================================================
-- 5. LIMPEZA (OPCIONAL)
-- =====================================================

-- Remover a função temporária após uso
-- DROP FUNCTION IF EXISTS fix_auto_coupon_format();

-- =====================================================
-- 6. INSTRUÇÕES DE USO
-- =====================================================

/*
COMO USAR:

1. Execute este script no Supabase SQL Editor
2. Verifique os resultados da função fix_auto_coupon_format()
3. Confirme que não há mais cupons com formato incorreto
4. Os cupons no Nuvemshop precisarão ser atualizados manualmente ou via API

IMPORTANTE:
- Este script apenas corrige os códigos na base de dados
- Os cupons já criados no Nuvemshop manterão o código antigo
- Para sincronizar com Nuvemshop, será necessário:
  a) Deletar os cupons antigos no Nuvemshop
  b) Recriar com os novos códigos
  c) Ou atualizar via API do Nuvemshop (se suportado)

FORMATO CORRIGIDO:
- Antes: primeirnome-15 (minúscula com traço)
- Depois: PRIMEIRNOME15 (maiúscula sem traço)
*/
