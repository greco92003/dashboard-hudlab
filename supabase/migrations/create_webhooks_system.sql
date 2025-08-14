-- =====================================================
-- SISTEMA DE WEBHOOKS NUVEMSHOP
-- =====================================================
-- Criação de tabelas para gerenciar webhooks do Nuvemshop
-- Substitui o sistema de sync manual por notificações em tempo real

-- Tabela para armazenar webhooks registrados
CREATE TABLE IF NOT EXISTS nuvemshop_webhooks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Webhook identification
  webhook_id TEXT UNIQUE, -- ID do webhook no Nuvemshop (quando registrado)
  event TEXT NOT NULL, -- Evento: order/created, product/updated, etc.
  url TEXT NOT NULL, -- URL do endpoint que recebe o webhook
  
  -- Status and configuration
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
  is_registered BOOLEAN DEFAULT false, -- Se foi registrado com sucesso no Nuvemshop
  
  -- Metadata
  description TEXT,
  created_by TEXT, -- Usuário que criou
  
  -- Error handling
  last_error TEXT,
  error_count INTEGER DEFAULT 0,
  last_error_at TIMESTAMP WITH TIME ZONE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  registered_at TIMESTAMP WITH TIME ZONE, -- Quando foi registrado no Nuvemshop
  last_received_at TIMESTAMP WITH TIME ZONE -- Último webhook recebido
);

-- Tabela para logs de webhooks recebidos
CREATE TABLE IF NOT EXISTS nuvemshop_webhook_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Webhook details
  event TEXT NOT NULL, -- order/created, product/updated, etc.
  webhook_id UUID REFERENCES nuvemshop_webhooks(id) ON DELETE SET NULL,
  
  -- Request details
  store_id TEXT NOT NULL, -- ID da loja que enviou
  resource_id TEXT NOT NULL, -- ID do recurso (order ID, product ID, etc.)
  
  -- Processing status
  status TEXT DEFAULT 'received' CHECK (status IN ('received', 'processing', 'processed', 'failed', 'ignored')),
  processing_started_at TIMESTAMP WITH TIME ZONE,
  processing_completed_at TIMESTAMP WITH TIME ZONE,
  processing_duration_ms INTEGER,
  
  -- Request data
  headers JSONB, -- Headers da requisição
  payload JSONB NOT NULL, -- Dados do webhook
  hmac_signature TEXT, -- Assinatura HMAC para verificação
  hmac_verified BOOLEAN DEFAULT false,
  
  -- Processing results
  result_data JSONB, -- Dados processados/salvos
  error_message TEXT,
  error_details JSONB,
  retry_count INTEGER DEFAULT 0,
  
  -- Timestamps
  received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela para estatísticas de webhooks
CREATE TABLE IF NOT EXISTS nuvemshop_webhook_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Period identification
  date DATE NOT NULL,
  event TEXT NOT NULL,
  
  -- Statistics
  total_received INTEGER DEFAULT 0,
  total_processed INTEGER DEFAULT 0,
  total_failed INTEGER DEFAULT 0,
  total_ignored INTEGER DEFAULT 0,
  
  -- Performance metrics
  avg_processing_time_ms NUMERIC(10,2),
  min_processing_time_ms INTEGER,
  max_processing_time_ms INTEGER,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Unique constraint for date + event
  UNIQUE(date, event)
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Webhooks table indexes
CREATE INDEX IF NOT EXISTS idx_nuvemshop_webhooks_event ON nuvemshop_webhooks(event);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_webhooks_status ON nuvemshop_webhooks(status);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_webhooks_is_registered ON nuvemshop_webhooks(is_registered);

-- Webhook logs indexes
CREATE INDEX IF NOT EXISTS idx_nuvemshop_webhook_logs_event ON nuvemshop_webhook_logs(event);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_webhook_logs_status ON nuvemshop_webhook_logs(status);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_webhook_logs_store_id ON nuvemshop_webhook_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_webhook_logs_resource_id ON nuvemshop_webhook_logs(resource_id);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_webhook_logs_received_at ON nuvemshop_webhook_logs(received_at);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_webhook_logs_webhook_id ON nuvemshop_webhook_logs(webhook_id);

-- Webhook stats indexes
CREATE INDEX IF NOT EXISTS idx_nuvemshop_webhook_stats_date ON nuvemshop_webhook_stats(date);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_webhook_stats_event ON nuvemshop_webhook_stats(event);

-- =====================================================
-- FUNCTIONS FOR WEBHOOK MANAGEMENT
-- =====================================================

-- Function to update webhook statistics
CREATE OR REPLACE FUNCTION update_webhook_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update stats when status changes to a final state
  IF NEW.status IN ('processed', 'failed', 'ignored') AND OLD.status != NEW.status THEN
    INSERT INTO nuvemshop_webhook_stats (
      date, 
      event,
      total_received,
      total_processed,
      total_failed,
      total_ignored,
      avg_processing_time_ms,
      min_processing_time_ms,
      max_processing_time_ms
    )
    VALUES (
      CURRENT_DATE,
      NEW.event,
      CASE WHEN NEW.status IN ('processed', 'failed', 'ignored') THEN 1 ELSE 0 END,
      CASE WHEN NEW.status = 'processed' THEN 1 ELSE 0 END,
      CASE WHEN NEW.status = 'failed' THEN 1 ELSE 0 END,
      CASE WHEN NEW.status = 'ignored' THEN 1 ELSE 0 END,
      COALESCE(NEW.processing_duration_ms, 0),
      COALESCE(NEW.processing_duration_ms, 0),
      COALESCE(NEW.processing_duration_ms, 0)
    )
    ON CONFLICT (date, event) DO UPDATE SET
      total_received = nuvemshop_webhook_stats.total_received + 1,
      total_processed = nuvemshop_webhook_stats.total_processed + CASE WHEN NEW.status = 'processed' THEN 1 ELSE 0 END,
      total_failed = nuvemshop_webhook_stats.total_failed + CASE WHEN NEW.status = 'failed' THEN 1 ELSE 0 END,
      total_ignored = nuvemshop_webhook_stats.total_ignored + CASE WHEN NEW.status = 'ignored' THEN 1 ELSE 0 END,
      avg_processing_time_ms = (
        (nuvemshop_webhook_stats.avg_processing_time_ms * (nuvemshop_webhook_stats.total_received - 1) + COALESCE(NEW.processing_duration_ms, 0)) 
        / nuvemshop_webhook_stats.total_received
      ),
      min_processing_time_ms = LEAST(nuvemshop_webhook_stats.min_processing_time_ms, COALESCE(NEW.processing_duration_ms, 999999)),
      max_processing_time_ms = GREATEST(nuvemshop_webhook_stats.max_processing_time_ms, COALESCE(NEW.processing_duration_ms, 0)),
      updated_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update stats
CREATE TRIGGER trigger_update_webhook_stats
  AFTER UPDATE ON nuvemshop_webhook_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_webhook_stats();

-- Function to clean old webhook logs (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_webhook_logs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM nuvemshop_webhook_logs 
  WHERE received_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on all webhook tables
ALTER TABLE nuvemshop_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE nuvemshop_webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE nuvemshop_webhook_stats ENABLE ROW LEVEL SECURITY;

-- Policies for authenticated users
CREATE POLICY "Users can view webhooks" ON nuvemshop_webhooks
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can manage webhooks" ON nuvemshop_webhooks
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Users can view webhook logs" ON nuvemshop_webhook_logs
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "System can insert webhook logs" ON nuvemshop_webhook_logs
  FOR INSERT WITH CHECK (true); -- Allow system to insert logs

CREATE POLICY "Users can view webhook stats" ON nuvemshop_webhook_stats
  FOR SELECT USING (auth.role() = 'authenticated');

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE nuvemshop_webhooks IS 'Stores registered webhooks for Nuvemshop events';
COMMENT ON TABLE nuvemshop_webhook_logs IS 'Logs all webhook requests received from Nuvemshop';
COMMENT ON TABLE nuvemshop_webhook_stats IS 'Daily statistics for webhook processing performance';

COMMENT ON COLUMN nuvemshop_webhooks.webhook_id IS 'Webhook ID returned by Nuvemshop API when registered';
COMMENT ON COLUMN nuvemshop_webhooks.event IS 'Event type: order/created, order/updated, product/created, etc.';
COMMENT ON COLUMN nuvemshop_webhook_logs.hmac_signature IS 'HMAC signature for webhook verification';
COMMENT ON COLUMN nuvemshop_webhook_logs.payload IS 'Complete webhook payload from Nuvemshop';
