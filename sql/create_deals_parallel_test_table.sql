-- Tabela para armazenar deals do teste paralelo
-- Execute este SQL no Supabase Dashboard > SQL Editor

CREATE TABLE IF NOT EXISTS deals_parallel_test (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id INTEGER UNIQUE NOT NULL,
  title TEXT,
  value NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'BRL',
  status TEXT,
  stage_id INTEGER,
  closing_date DATE,
  created_date TIMESTAMP,
  custom_field_value TEXT,
  custom_field_id TEXT,
  estado TEXT,
  "quantidade-de-pares" TEXT,
  vendedor TEXT,
  designer TEXT,
  "utm-source" TEXT,
  "utm-medium" TEXT,
  contact_id INTEGER,
  organization_id INTEGER,
  api_updated_at TIMESTAMP,
  last_synced_at TIMESTAMP DEFAULT NOW(),
  sync_status TEXT DEFAULT 'synced',
  test_batch TEXT, -- Para identificar diferentes execuções de teste
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_deals_parallel_test_deal_id ON deals_parallel_test(deal_id);
CREATE INDEX IF NOT EXISTS idx_deals_parallel_test_closing_date ON deals_parallel_test(closing_date);
CREATE INDEX IF NOT EXISTS idx_deals_parallel_test_status ON deals_parallel_test(status);
CREATE INDEX IF NOT EXISTS idx_deals_parallel_test_test_batch ON deals_parallel_test(test_batch);
CREATE INDEX IF NOT EXISTS idx_deals_parallel_test_created_at ON deals_parallel_test(created_at);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_deals_parallel_test_updated_at 
    BEFORE UPDATE ON deals_parallel_test 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Comentários para documentação
COMMENT ON TABLE deals_parallel_test IS 'Tabela para testes de performance do robust-deals-sync paralelo';
COMMENT ON COLUMN deals_parallel_test.deal_id IS 'ID único do deal no ActiveCampaign';
COMMENT ON COLUMN deals_parallel_test.test_batch IS 'Identificador do lote de teste para comparações';
COMMENT ON COLUMN deals_parallel_test.sync_status IS 'Status da sincronização (synced, error, pending)';

-- Verificar se a tabela foi criada
SELECT 
    table_name, 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'deals_parallel_test' 
ORDER BY ordinal_position;
