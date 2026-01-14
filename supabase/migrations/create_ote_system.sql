-- =====================================================
-- SISTEMA OTE (ON TARGET EARNINGS)
-- =====================================================
-- Sistema de comissionamento individual por vendedor
-- Execute este script no Supabase SQL Editor

-- =====================================================
-- 1. TABELA DE CONFIGURAÇÃO OTE
-- =====================================================
CREATE TABLE IF NOT EXISTS ote_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Configurações globais
  paid_traffic_percentage DECIMAL(5,2) DEFAULT 80.00 NOT NULL, -- 80%
  organic_percentage DECIMAL(5,2) DEFAULT 20.00 NOT NULL, -- 20%
  
  -- Tabela de multiplicadores (JSONB)
  multipliers JSONB DEFAULT '[
    {"min": 0, "max": 70, "multiplier": 0},
    {"min": 71, "max": 85, "multiplier": 0.5},
    {"min": 86, "max": 99, "multiplier": 0.7},
    {"min": 100, "max": 119, "multiplier": 1},
    {"min": 120, "max": 149, "multiplier": 1.5},
    {"min": 150, "max": 999, "multiplier": 2}
  ]'::JSONB NOT NULL,
  
  -- Metadata
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- =====================================================
-- 2. TABELA DE VENDEDORES OTE
-- =====================================================
CREATE TABLE IF NOT EXISTS ote_sellers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Referência ao usuário
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  
  -- Nome do vendedor no ActiveCampaign (para vincular com deals)
  seller_name TEXT NOT NULL, -- Ex: "Schaiany", "João", etc
  
  -- Configurações individuais
  salary_fixed DECIMAL(10,2) NOT NULL DEFAULT 0, -- Salário fixo (ex: R$ 1.846,25)
  commission_percentage DECIMAL(5,2) NOT NULL DEFAULT 2.00, -- % da meta que vira comissão (ex: 2%)
  
  -- Status
  active BOOLEAN DEFAULT true,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- =====================================================
-- 3. TABELA DE METAS MENSAIS
-- =====================================================
CREATE TABLE IF NOT EXISTS ote_monthly_targets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Referência ao vendedor
  seller_id UUID REFERENCES ote_sellers(id) ON DELETE CASCADE NOT NULL,
  
  -- Período da meta
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2020 AND year <= 2100),
  
  -- Valor da meta
  target_amount DECIMAL(12,2) NOT NULL, -- Ex: R$ 150.000,00
  
  -- Constraint única: um vendedor só pode ter uma meta por mês/ano
  UNIQUE(seller_id, month, year),
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- =====================================================
-- 4. TABELA DE HISTÓRICO DE COMISSÕES
-- =====================================================
CREATE TABLE IF NOT EXISTS ote_commission_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Referência ao vendedor e meta
  seller_id UUID REFERENCES ote_sellers(id) ON DELETE CASCADE NOT NULL,
  target_id UUID REFERENCES ote_monthly_targets(id) ON DELETE CASCADE NOT NULL,
  
  -- Período
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  
  -- Valores calculados
  target_amount DECIMAL(12,2) NOT NULL,
  achieved_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  achievement_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  
  -- Detalhamento por canal
  paid_traffic_sales DECIMAL(12,2) NOT NULL DEFAULT 0,
  organic_sales DECIMAL(12,2) NOT NULL DEFAULT 0,
  
  -- Comissões
  base_commission DECIMAL(10,2) NOT NULL DEFAULT 0, -- 2% da meta
  multiplier DECIMAL(3,2) NOT NULL DEFAULT 0,
  commission_paid_traffic DECIMAL(10,2) NOT NULL DEFAULT 0,
  commission_organic DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_commission DECIMAL(10,2) NOT NULL DEFAULT 0,
  
  -- Total final
  salary_fixed DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_earnings DECIMAL(10,2) NOT NULL DEFAULT 0, -- fixo + comissão
  
  -- Metadata
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 5. TABELA DE NOTIFICAÇÕES OTE
-- =====================================================
CREATE TABLE IF NOT EXISTS ote_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Referência ao vendedor
  seller_id UUID REFERENCES ote_sellers(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  
  -- Tipo de notificação
  type TEXT NOT NULL CHECK (type IN ('milestone', 'target_achieved', 'multiplier_unlocked')),
  
  -- Conteúdo
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  
  -- Dados adicionais
  metadata JSONB DEFAULT '{}'::JSONB,
  
  -- Status
  read BOOLEAN DEFAULT false,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 6. ÍNDICES PARA PERFORMANCE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_ote_sellers_user_id ON ote_sellers(user_id);
CREATE INDEX IF NOT EXISTS idx_ote_sellers_seller_name ON ote_sellers(seller_name);
CREATE INDEX IF NOT EXISTS idx_ote_sellers_active ON ote_sellers(active) WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_ote_monthly_targets_seller_id ON ote_monthly_targets(seller_id);
CREATE INDEX IF NOT EXISTS idx_ote_monthly_targets_period ON ote_monthly_targets(year, month);

CREATE INDEX IF NOT EXISTS idx_ote_commission_history_seller_id ON ote_commission_history(seller_id);
CREATE INDEX IF NOT EXISTS idx_ote_commission_history_period ON ote_commission_history(year, month);

CREATE INDEX IF NOT EXISTS idx_ote_notifications_user_id ON ote_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_ote_notifications_read ON ote_notifications(read) WHERE read = false;

-- =====================================================
-- 7. TRIGGERS PARA UPDATED_AT
-- =====================================================
CREATE OR REPLACE FUNCTION update_ote_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_ote_config_updated_at
  BEFORE UPDATE ON ote_config
  FOR EACH ROW
  EXECUTE FUNCTION update_ote_updated_at();

CREATE TRIGGER trigger_update_ote_sellers_updated_at
  BEFORE UPDATE ON ote_sellers
  FOR EACH ROW
  EXECUTE FUNCTION update_ote_updated_at();

CREATE TRIGGER trigger_update_ote_monthly_targets_updated_at
  BEFORE UPDATE ON ote_monthly_targets
  FOR EACH ROW
  EXECUTE FUNCTION update_ote_updated_at();

CREATE TRIGGER trigger_update_ote_commission_history_updated_at
  BEFORE UPDATE ON ote_commission_history
  FOR EACH ROW
  EXECUTE FUNCTION update_ote_updated_at();

-- =====================================================
-- 8. ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE ote_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE ote_sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ote_monthly_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ote_commission_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE ote_notifications ENABLE ROW LEVEL SECURITY;

-- Políticas para ote_config
CREATE POLICY "Todos podem ver configurações OTE" ON ote_config
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.approved = true
    )
  );

CREATE POLICY "Apenas admins e owners podem editar configurações OTE" ON ote_config
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('owner', 'admin')
      AND user_profiles.approved = true
    )
  );

-- Políticas para ote_sellers
CREATE POLICY "Vendedores podem ver seus próprios dados" ON ote_sellers
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('owner', 'admin')
      AND user_profiles.approved = true
    )
  );

CREATE POLICY "Apenas admins e owners podem gerenciar vendedores" ON ote_sellers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('owner', 'admin')
      AND user_profiles.approved = true
    )
  );

-- Políticas para ote_monthly_targets
CREATE POLICY "Vendedores podem ver suas próprias metas" ON ote_monthly_targets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM ote_sellers
      WHERE ote_sellers.id = ote_monthly_targets.seller_id
      AND ote_sellers.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('owner', 'admin')
      AND user_profiles.approved = true
    )
  );

CREATE POLICY "Apenas admins e owners podem gerenciar metas" ON ote_monthly_targets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('owner', 'admin')
      AND user_profiles.approved = true
    )
  );

-- Políticas para ote_commission_history
CREATE POLICY "Vendedores podem ver seu próprio histórico" ON ote_commission_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM ote_sellers
      WHERE ote_sellers.id = ote_commission_history.seller_id
      AND ote_sellers.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('owner', 'admin')
      AND user_profiles.approved = true
    )
  );

CREATE POLICY "Sistema pode inserir histórico" ON ote_commission_history
  FOR INSERT WITH CHECK (true);

-- Políticas para ote_notifications
CREATE POLICY "Usuários podem ver suas próprias notificações" ON ote_notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Usuários podem atualizar suas próprias notificações" ON ote_notifications
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Sistema pode criar notificações" ON ote_notifications
  FOR INSERT WITH CHECK (true);

-- =====================================================
-- 9. INSERIR CONFIGURAÇÃO PADRÃO
-- =====================================================
INSERT INTO ote_config (
  paid_traffic_percentage,
  organic_percentage,
  active
) VALUES (
  80.00,
  20.00,
  true
) ON CONFLICT DO NOTHING;

-- =====================================================
-- 10. COMENTÁRIOS PARA DOCUMENTAÇÃO
-- =====================================================
COMMENT ON TABLE ote_config IS 'Configurações globais do sistema OTE';
COMMENT ON TABLE ote_sellers IS 'Vendedores cadastrados no sistema OTE';
COMMENT ON TABLE ote_monthly_targets IS 'Metas mensais individuais por vendedor';
COMMENT ON TABLE ote_commission_history IS 'Histórico de comissões calculadas';
COMMENT ON TABLE ote_notifications IS 'Notificações de marcos e conquistas OTE';

COMMENT ON COLUMN ote_sellers.seller_name IS 'Nome do vendedor conforme aparece no campo "vendedor" da tabela deals_cache';
COMMENT ON COLUMN ote_monthly_targets.target_amount IS 'Valor da meta mensal em reais';
COMMENT ON COLUMN ote_commission_history.multiplier IS 'Multiplicador aplicado baseado no % de atingimento da meta';

