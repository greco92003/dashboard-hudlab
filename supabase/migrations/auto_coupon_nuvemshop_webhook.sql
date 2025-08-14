-- =====================================================
-- TRIGGER AUTOMÁTICO PARA CRIAR CUPONS NO NUVEMSHOP
-- =====================================================
-- Este script cria um trigger que automaticamente envia cupons
-- para o NuvemShop quando são criados no Supabase com status "pending"

-- =====================================================
-- 1. FUNÇÃO PARA PROCESSAR CUPOM NO NUVEMSHOP
-- =====================================================

CREATE OR REPLACE FUNCTION process_coupon_in_nuvemshop()
RETURNS TRIGGER AS $$
DECLARE
  nuvemshop_response JSONB;
  product_ids INTEGER[];
  coupon_payload JSONB;
  http_response RECORD;
  error_message TEXT;
  access_token TEXT;
  user_id TEXT;
BEGIN
  -- Só processar se for um cupom novo com status "pending"
  IF TG_OP = 'INSERT' AND NEW.nuvemshop_status = 'pending' THEN

    BEGIN
      -- Buscar credenciais do NuvemShop
      SELECT value INTO access_token FROM system_config WHERE key = 'nuvemshop_access_token';
      SELECT value INTO user_id FROM system_config WHERE key = 'nuvemshop_user_id';

      -- Verificar se as credenciais estão configuradas
      IF access_token IS NULL OR access_token = 'PLACEHOLDER_TOKEN' OR
         user_id IS NULL OR user_id = 'PLACEHOLDER_USER_ID' THEN
        RAISE WARNING 'Credenciais do NuvemShop não configuradas. Cupom % permanecerá pendente.', NEW.code;
        RETURN NEW;
      END IF;

      -- Log do início do processamento
      RAISE NOTICE 'Processando cupom % para marca % no NuvemShop', NEW.code, NEW.brand;
      
      -- Buscar produtos da marca para aplicar restrições
      SELECT ARRAY_AGG(CAST(product_id AS INTEGER))
      INTO product_ids
      FROM nuvemshop_products 
      WHERE brand = NEW.brand 
        AND published = true 
        AND sync_status = 'synced'
        AND product_id ~ '^[0-9]+$'; -- Apenas IDs numéricos válidos
      
      -- Se não encontrou produtos, usar array vazio (cupom geral)
      IF product_ids IS NULL THEN
        product_ids := ARRAY[]::INTEGER[];
      END IF;
      
      RAISE NOTICE 'Produtos encontrados para marca %: %', NEW.brand, array_length(product_ids, 1);
      
      -- Preparar payload do cupom
      coupon_payload := jsonb_build_object(
        'code', NEW.code,
        'type', 'percentage',
        'value', NEW.percentage::TEXT,
        'valid', true,
        'max_uses', COALESCE(NEW.max_uses, 999999),
        'start_date', CURRENT_DATE::TEXT,
        'end_date', (NEW.valid_until::DATE)::TEXT,
        'min_price', 0,
        'first_consumer_purchase', false,
        'combines_with_other_discounts', false,
        'includes_shipping', false
      );
      
      -- Adicionar produtos se existirem
      IF array_length(product_ids, 1) > 0 THEN
        coupon_payload := coupon_payload || jsonb_build_object('products', to_jsonb(product_ids));
      END IF;
      
      RAISE NOTICE 'Payload do cupom: %', coupon_payload;
      
      -- Fazer chamada HTTP para o NuvemShop
      SELECT INTO http_response *
      FROM net.http_post(
        url := 'https://api.nuvemshop.com.br/v1/' || user_id || '/coupons',
        headers := jsonb_build_object(
          'Authentication', 'bearer ' || access_token,
          'Content-Type', 'application/json',
          'User-Agent', 'HudLab Dashboard (contato@hudlab.com.br)'
        ),
        body := coupon_payload
      );
      
      -- Verificar resposta
      IF http_response.status_code = 201 THEN
        -- Sucesso - extrair ID do cupom criado
        nuvemshop_response := http_response.content::JSONB;
        
        -- Atualizar registro com ID do NuvemShop
        UPDATE generated_coupons 
        SET 
          nuvemshop_coupon_id = (nuvemshop_response->>'id'),
          nuvemshop_status = 'created',
          nuvemshop_error = NULL,
          updated_at = NOW()
        WHERE id = NEW.id;
        
        RAISE NOTICE 'Cupom % criado com sucesso no NuvemShop (ID: %)', NEW.code, (nuvemshop_response->>'id');
        
      ELSE
        -- Erro na criação
        error_message := 'HTTP ' || http_response.status_code || ': ' || COALESCE(http_response.content, 'Unknown error');
        
        -- Atualizar registro com erro
        UPDATE generated_coupons 
        SET 
          nuvemshop_status = 'error',
          nuvemshop_error = error_message,
          updated_at = NOW()
        WHERE id = NEW.id;
        
        RAISE WARNING 'Erro ao criar cupom % no NuvemShop: %', NEW.code, error_message;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      -- Capturar qualquer erro e atualizar status
      error_message := 'Erro interno: ' || SQLERRM;
      
      UPDATE generated_coupons 
      SET 
        nuvemshop_status = 'error',
        nuvemshop_error = error_message,
        updated_at = NOW()
      WHERE id = NEW.id;
      
      RAISE WARNING 'Erro ao processar cupom %: %', NEW.code, error_message;
    END;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 2. CRIAR TRIGGER PARA PROCESSAR CUPONS AUTOMATICAMENTE
-- =====================================================

-- Remover trigger existente se houver
DROP TRIGGER IF EXISTS trigger_process_coupon_nuvemshop ON generated_coupons;

-- Criar novo trigger
CREATE TRIGGER trigger_process_coupon_nuvemshop
  AFTER INSERT ON generated_coupons
  FOR EACH ROW
  EXECUTE FUNCTION process_coupon_in_nuvemshop();

-- =====================================================
-- 3. CRIAR TABELA DE CONFIGURAÇÕES
-- =====================================================

-- Criar tabela para configurações do sistema
CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

-- Política para permitir apenas service role
CREATE POLICY "Service role can manage system config" ON system_config
  FOR ALL USING (auth.role() = 'service_role');

-- Inserir configurações do NuvemShop (valores placeholder)
INSERT INTO system_config (key, value, description) VALUES
  ('nuvemshop_access_token', 'PLACEHOLDER_TOKEN', 'Token de acesso da API do NuvemShop'),
  ('nuvemshop_user_id', 'PLACEHOLDER_USER_ID', 'ID do usuário no NuvemShop')
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- 4. COMENTÁRIOS E DOCUMENTAÇÃO
-- =====================================================

COMMENT ON FUNCTION process_coupon_in_nuvemshop() IS 
'Função trigger que automaticamente cria cupons no NuvemShop quando são inseridos na tabela generated_coupons com status pending. Usa a extensão pg_net para fazer chamadas HTTP.';

COMMENT ON TRIGGER trigger_process_coupon_nuvemshop ON generated_coupons IS 
'Trigger que executa automaticamente após inserção de novos cupons para criá-los no NuvemShop via API.';

-- =====================================================
-- 5. TESTE DA CONFIGURAÇÃO
-- =====================================================

-- Para testar se as configurações estão corretas:
-- SELECT * FROM system_config WHERE key LIKE 'nuvemshop_%';

-- Para testar a extensão pg_net:
-- SELECT net.http_get('https://httpbin.org/get');

-- =====================================================
-- 6. INSTRUÇÕES PARA CONFIGURAR CREDENCIAIS REAIS
-- =====================================================

-- IMPORTANTE: Após executar esta migração, configure as credenciais reais:
--
-- UPDATE system_config
-- SET value = 'seu-access-token-real-aqui'
-- WHERE key = 'nuvemshop_access_token';
--
-- UPDATE system_config
-- SET value = 'seu-user-id-real-aqui'
-- WHERE key = 'nuvemshop_user_id';
