-- =====================================================
-- VERIFICAR LINKS DA ZENITH
-- =====================================================

-- 1. Ver TODOS os links da Zenith (ativos e inativos)
SELECT 
  id,
  brand,
  url,
  is_active,
  created_at,
  CASE 
    WHEN url LIKE '%Santos-SP%' THEN '🏖️ Santos-SP'
    WHEN url LIKE '%Garopaba-SC%' THEN '🌊 Garopaba-SC'
    WHEN url LIKE '%Taquara-RS%' THEN '🏔️ Taquara-RS'
    ELSE '❓ Sem franquia específica'
  END as franchise
FROM affiliate_links
WHERE brand ILIKE '%zenith%'
ORDER BY is_active DESC, created_at DESC;

-- 2. Contar links ativos por franquia
SELECT 
  CASE 
    WHEN url LIKE '%Santos-SP%' THEN 'Santos-SP'
    WHEN url LIKE '%Garopaba-SC%' THEN 'Garopaba-SC'
    WHEN url LIKE '%Taquara-RS%' THEN 'Taquara-RS'
    ELSE 'Sem franquia'
  END as franchise,
  COUNT(*) as total,
  COUNT(CASE WHEN is_active THEN 1 END) as active
FROM affiliate_links
WHERE brand ILIKE '%zenith%'
GROUP BY franchise
ORDER BY franchise;

-- 3. Verificar se falta alguma franquia
WITH expected_franchises AS (
  SELECT unnest(ARRAY['Santos-SP', 'Garopaba-SC', 'Taquara-RS']) as franchise
),
existing_franchises AS (
  SELECT 
    CASE 
      WHEN url LIKE '%Santos-SP%' THEN 'Santos-SP'
      WHEN url LIKE '%Garopaba-SC%' THEN 'Garopaba-SC'
      WHEN url LIKE '%Taquara-RS%' THEN 'Taquara-RS'
    END as franchise
  FROM affiliate_links
  WHERE brand ILIKE '%zenith%'
    AND is_active = true
)
SELECT 
  ef.franchise,
  CASE 
    WHEN exf.franchise IS NOT NULL THEN '✅ Existe'
    ELSE '❌ FALTANDO'
  END as status
FROM expected_franchises ef
LEFT JOIN existing_franchises exf ON ef.franchise = exf.franchise
ORDER BY ef.franchise;

-- 4. Resultado esperado: Deve ter 3 links ativos, um para cada franquia
-- Santos-SP: ✅ Existe
-- Garopaba-SC: ✅ Existe
-- Taquara-RS: ✅ Existe

