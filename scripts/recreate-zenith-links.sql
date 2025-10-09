-- =====================================================
-- RECRIAR LINKS DA ZENITH COM FRANQUIAS
-- =====================================================
-- Este script desativa os links antigos da Zenith e cria novos com franquias

-- PASSO 1: Ver os links atuais da Zenith
SELECT 
  id,
  brand,
  url,
  is_active,
  created_at
FROM affiliate_links
WHERE brand ILIKE '%zenith%';

-- PASSO 2: Desativar links antigos da Zenith (se existirem sem franquia)
-- ATENÇÃO: Descomente para executar
/*
UPDATE affiliate_links
SET is_active = false
WHERE brand ILIKE '%zenith%'
  AND url NOT LIKE '%Santos-SP%'
  AND url NOT LIKE '%Garopaba-SC%'
  AND url NOT LIKE '%Taquara-RS%';
*/

-- PASSO 3: Criar novos links da Zenith com franquias
-- ATENÇÃO: Descomente para executar
/*
-- Link para Santos-SP
INSERT INTO affiliate_links (url, brand, created_by, is_active)
SELECT 
  'https://hudlab.com.br/?utm_source=LandingPage&utm_medium=Zenith-Santos-SP',
  'Zenith',
  (SELECT id FROM user_profiles WHERE role IN ('admin', 'owner') AND approved = true LIMIT 1),
  true
WHERE NOT EXISTS (
  SELECT 1 FROM affiliate_links 
  WHERE brand = 'Zenith' 
    AND url LIKE '%Santos-SP%' 
    AND is_active = true
);

-- Link para Garopaba-SC
INSERT INTO affiliate_links (url, brand, created_by, is_active)
SELECT 
  'https://hudlab.com.br/?utm_source=LandingPage&utm_medium=Zenith-Garopaba-SC',
  'Zenith',
  (SELECT id FROM user_profiles WHERE role IN ('admin', 'owner') AND approved = true LIMIT 1),
  true
WHERE NOT EXISTS (
  SELECT 1 FROM affiliate_links 
  WHERE brand = 'Zenith' 
    AND url LIKE '%Garopaba-SC%' 
    AND is_active = true
);

-- Link para Taquara-RS
INSERT INTO affiliate_links (url, brand, created_by, is_active)
SELECT 
  'https://hudlab.com.br/?utm_source=LandingPage&utm_medium=Zenith-Taquara-RS',
  'Zenith',
  (SELECT id FROM user_profiles WHERE role IN ('admin', 'owner') AND approved = true LIMIT 1),
  true
WHERE NOT EXISTS (
  SELECT 1 FROM affiliate_links 
  WHERE brand = 'Zenith' 
    AND url LIKE '%Taquara-RS%' 
    AND is_active = true
);
*/

-- PASSO 4: Verificar resultado
SELECT 
  id,
  brand,
  url,
  CASE 
    WHEN url LIKE '%Santos-SP%' THEN '✅ Santos-SP'
    WHEN url LIKE '%Garopaba-SC%' THEN '✅ Garopaba-SC'
    WHEN url LIKE '%Taquara-RS%' THEN '✅ Taquara-RS'
    ELSE '❌ SEM FRANQUIA'
  END as franchise,
  is_active,
  created_at
FROM affiliate_links
WHERE brand ILIKE '%zenith%'
ORDER BY is_active DESC, created_at DESC;

