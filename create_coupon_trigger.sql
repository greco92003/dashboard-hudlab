-- Função para processar cupom no NuvemShop
CREATE OR REPLACE FUNCTION process_coupon_in_nuvemshop()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
$function$;
