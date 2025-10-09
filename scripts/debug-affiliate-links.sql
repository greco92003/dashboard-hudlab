-- =====================================================
-- SCRIPT DE DEBUG PARA AFFILIATE LINKS
-- =====================================================
-- Execute este script no Supabase SQL Editor para diagnosticar o problema

-- 1. Verificar se a tabela existe e sua estrutura
SELECT 
  table_name, 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_name = 'affiliate_links'
ORDER BY ordinal_position;

-- 2. Verificar quantos links existem atualmente
SELECT 
  COUNT(*) as total_links,
  COUNT(DISTINCT brand) as total_brands
FROM affiliate_links;

-- 3. Ver todos os links existentes
SELECT 
  id,
  brand,
  url,
  is_active,
  created_at,
  created_by
FROM affiliate_links
ORDER BY created_at DESC;

-- 4. Verificar marcas que têm produtos mas não têm links
SELECT DISTINCT 
  np.brand,
  COUNT(*) as product_count
FROM nuvemshop_products np
WHERE np.published = true 
  AND np.sync_status = 'synced'
  AND np.brand IS NOT NULL 
  AND np.brand != ''
  AND NOT EXISTS (
    SELECT 1 FROM affiliate_links al 
    WHERE al.brand = np.brand 
    AND al.is_active = true
  )
GROUP BY np.brand
ORDER BY np.brand;

-- 5. Verificar políticas RLS (Row Level Security)
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'affiliate_links';

-- 6. Verificar se o usuário atual tem permissões
SELECT 
  auth.uid() as current_user_id,
  up.role,
  up.approved
FROM user_profiles up
WHERE up.id = auth.uid();

-- 7. Testar inserção manual de um link (TESTE)
-- ATENÇÃO: Descomente apenas se quiser testar a inserção
/*
INSERT INTO affiliate_links (url, brand, created_by, is_active)
VALUES (
  'https://hudlab.com.br/?utm_source=LandingPage&utm_medium=TESTE',
  'TESTE',
  auth.uid(),
  true
)
RETURNING *;
*/

-- 8. Verificar se existem erros de constraint
SELECT 
  conname as constraint_name,
  contype as constraint_type,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'affiliate_links'::regclass;

-- 9. Testar a função de geração automática (para marca comum)
-- ATENÇÃO: Descomente apenas se quiser testar
/*
SELECT * FROM generate_auto_affiliate_link_for_brand('TESTE-MARCA');
*/

-- 10. Testar a função de geração automática (para Zenith)
-- ATENÇÃO: Descomente apenas se quiser testar
/*
SELECT * FROM generate_auto_affiliate_link_for_brand('Zenith', 'Taquara-RS');
*/

