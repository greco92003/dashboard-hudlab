-- Verificar triggers ativos
SELECT 
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement,
  trigger_schema,
  event_object_table
FROM information_schema.triggers 
WHERE trigger_name IN ('trigger_auto_coupon_new_brand', 'trigger_process_coupon_nuvemshop')
ORDER BY trigger_name;

-- Verificar se as funções existem
SELECT 
  routine_name,
  routine_type,
  routine_definition
FROM information_schema.routines 
WHERE routine_name IN ('trigger_auto_coupon_on_new_brand', 'process_coupon_in_nuvemshop', 'generate_auto_coupon_for_brand')
ORDER BY routine_name;

-- Verificar configurações do sistema
SELECT key, value, description 
FROM system_config 
WHERE key LIKE '%nuvemshop%'
ORDER BY key;
