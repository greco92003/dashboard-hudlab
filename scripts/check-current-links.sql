-- =====================================================
-- VERIFICAR LINKS ATUAIS E COMPARAR COM O ESPERADO
-- =====================================================

-- 1. Ver TODOS os links de afiliado (ativos e inativos)
SELECT 
  id,
  brand,
  url,
  is_active,
  created_at,
  created_by
FROM affiliate_links
ORDER BY brand, created_at DESC;

-- 2. Contar links por marca
SELECT 
  brand,
  COUNT(*) as total_links,
  COUNT(CASE WHEN is_active THEN 1 END) as active_links
FROM affiliate_links
GROUP BY brand
ORDER BY brand;

-- 3. Ver especificamente os links da Zenith
SELECT 
  id,
  brand,
  url,
  is_active,
  created_at
FROM affiliate_links
WHERE brand ILIKE '%zenith%'
ORDER BY created_at DESC;

-- 4. Verificar se os links da Zenith têm o formato correto (com franquia)
SELECT 
  brand,
  url,
  CASE 
    WHEN url LIKE '%Santos-SP%' THEN 'Santos-SP'
    WHEN url LIKE '%Garopaba-SC%' THEN 'Garopaba-SC'
    WHEN url LIKE '%Taquara-RS%' THEN 'Taquara-RS'
    ELSE 'SEM FRANQUIA'
  END as franchise,
  is_active
FROM affiliate_links
WHERE brand ILIKE '%zenith%'
ORDER BY url;

-- 5. Ver todas as marcas que têm produtos
SELECT DISTINCT 
  brand,
  COUNT(*) as product_count
FROM nuvemshop_products
WHERE published = true 
  AND sync_status = 'synced'
  AND brand IS NOT NULL 
  AND brand != ''
GROUP BY brand
ORDER BY brand;

-- 6. Comparar: Marcas com produtos vs Marcas com links
WITH brands_with_products AS (
  SELECT DISTINCT brand
  FROM nuvemshop_products
  WHERE published = true 
    AND sync_status = 'synced'
    AND brand IS NOT NULL 
    AND brand != ''
),
brands_with_links AS (
  SELECT DISTINCT brand
  FROM affiliate_links
  WHERE is_active = true
)
SELECT 
  COALESCE(p.brand, l.brand) as brand,
  CASE WHEN p.brand IS NOT NULL THEN '✅' ELSE '❌' END as has_products,
  CASE WHEN l.brand IS NOT NULL THEN '✅' ELSE '❌' END as has_link
FROM brands_with_products p
FULL OUTER JOIN brands_with_links l ON p.brand = l.brand
ORDER BY brand;

