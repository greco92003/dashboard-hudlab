-- =====================================================
-- INVESTIGAR MARCA "Mestrão Faixa Branca"
-- =====================================================

-- 1. Verificar se existem produtos da marca no banco
SELECT 
  id,
  product_id,
  name_pt,
  brand,
  published,
  sync_status,
  last_synced_at,
  created_at
FROM nuvemshop_products
WHERE brand ILIKE '%mestr%'
ORDER BY last_synced_at DESC;

-- 2. Verificar todas as marcas disponíveis (usando a função)
SELECT * FROM get_available_brands()
WHERE brand ILIKE '%mestr%';

-- 3. Verificar todas as marcas únicas na tabela
SELECT 
  brand,
  COUNT(*) as total_products,
  COUNT(*) FILTER (WHERE published = true) as published_products,
  COUNT(*) FILTER (WHERE sync_status = 'synced') as synced_products,
  MAX(last_synced_at) as last_sync
FROM nuvemshop_products
WHERE brand IS NOT NULL AND brand != ''
GROUP BY brand
HAVING brand ILIKE '%mestr%'
ORDER BY brand;

-- 4. Verificar se há links de afiliado para esta marca
SELECT 
  id,
  url,
  brand,
  is_active,
  created_at
FROM affiliate_links
WHERE brand ILIKE '%mestr%'
ORDER BY created_at DESC;

-- 5. Verificar se há cupons para esta marca
SELECT 
  id,
  code,
  brand,
  is_active,
  is_auto_generated,
  created_at
FROM generated_coupons
WHERE brand ILIKE '%mestr%'
ORDER BY created_at DESC;

-- 6. Listar todas as marcas disponíveis (para comparação)
SELECT * FROM get_available_brands()
ORDER BY brand;

