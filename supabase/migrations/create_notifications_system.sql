-- =====================================================
-- NOTIFICATIONS SYSTEM SETUP
-- =====================================================
-- Este script cria o sistema completo de notificações
-- Execute este script no Supabase SQL Editor

-- =====================================================
-- 1. TABELA DE NOTIFICAÇÕES
-- =====================================================

-- Criar tabela principal de notificações
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('info', 'success', 'warning', 'error', 'sale')),
  
  -- Metadados da notificação
  data JSONB DEFAULT '{}',
  
  -- Quem criou a notificação
  created_by_user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_by_name TEXT,
  created_by_email TEXT,
  
  -- Configurações de envio
  target_type TEXT NOT NULL CHECK (target_type IN ('role', 'user', 'brand_partners')),
  target_roles TEXT[], -- Para target_type = 'role'
  target_user_ids UUID[], -- Para target_type = 'user'
  target_brand TEXT, -- Para target_type = 'brand_partners'
  
  -- Status da notificação
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'failed')),
  sent_at TIMESTAMP WITH TIME ZONE,
  
  -- Configurações de push notification
  send_push BOOLEAN DEFAULT true,
  push_sent_count INTEGER DEFAULT 0,
  push_failed_count INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_notifications_created_by ON notifications(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_target_type ON notifications(target_type);
CREATE INDEX IF NOT EXISTS idx_notifications_target_brand ON notifications(target_brand);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);

-- =====================================================
-- 2. TABELA DE NOTIFICAÇÕES PARA USUÁRIOS
-- =====================================================

-- Tabela para rastrear quais usuários receberam/leram cada notificação
CREATE TABLE IF NOT EXISTS user_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  
  -- Status de leitura
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP WITH TIME ZONE,
  
  -- Status de push notification
  push_sent BOOLEAN DEFAULT false,
  push_sent_at TIMESTAMP WITH TIME ZONE,
  push_error TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraint para evitar duplicatas
  UNIQUE(notification_id, user_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_id ON user_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_notification_id ON user_notifications(notification_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_is_read ON user_notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_user_notifications_created_at ON user_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_unread ON user_notifications(user_id, is_read) WHERE is_read = false;

-- =====================================================
-- 3. TABELA DE PUSH NOTIFICATION SUBSCRIPTIONS
-- =====================================================

-- Tabela para armazenar subscriptions de push notifications
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  
  -- Dados da subscription (Web Push API)
  endpoint TEXT NOT NULL,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  
  -- Metadados do dispositivo
  user_agent TEXT,
  device_type TEXT, -- 'mobile', 'desktop', 'tablet'
  browser_name TEXT,
  
  -- Status da subscription
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraint para evitar duplicatas por endpoint
  UNIQUE(endpoint)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_is_active ON push_subscriptions(is_active);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);

-- =====================================================
-- 4. TABELA DE CONFIGURAÇÕES DE NOTIFICAÇÕES
-- =====================================================

-- Tabela para configurações globais e por usuário
CREATE TABLE IF NOT EXISTS notification_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  
  -- Configurações (null = configuração global)
  -- Se user_id for null, são configurações globais do sistema
  
  -- Tipos de notificação habilitados
  enable_push_notifications BOOLEAN DEFAULT true,
  enable_sale_notifications BOOLEAN DEFAULT true,
  enable_admin_notifications BOOLEAN DEFAULT true,
  enable_system_notifications BOOLEAN DEFAULT true,
  
  -- Configurações de horário (para não incomodar)
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  quiet_hours_timezone TEXT DEFAULT 'America/Sao_Paulo',
  
  -- Configurações de frequência
  max_notifications_per_hour INTEGER DEFAULT 10,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraint para garantir apenas uma configuração por usuário
  UNIQUE(user_id)
);

-- Índice para performance
CREATE INDEX IF NOT EXISTS idx_notification_settings_user_id ON notification_settings(user_id);

-- =====================================================
-- 5. FUNÇÕES AUXILIARES
-- =====================================================

-- Função para contar notificações não lidas de um usuário
CREATE OR REPLACE FUNCTION get_unread_notifications_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE SQL
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COUNT(*)::INTEGER
  FROM user_notifications un
  WHERE un.user_id = p_user_id 
    AND un.is_read = false;
$$;

-- Função para marcar notificação como lida
CREATE OR REPLACE FUNCTION mark_notification_as_read(p_notification_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = 'public'
AS $$
  UPDATE user_notifications 
  SET 
    is_read = true,
    read_at = NOW(),
    updated_at = NOW()
  WHERE notification_id = p_notification_id 
    AND user_id = p_user_id 
    AND is_read = false
  RETURNING true;
$$;

-- Função para marcar todas as notificações como lidas
CREATE OR REPLACE FUNCTION mark_all_notifications_as_read(p_user_id UUID)
RETURNS INTEGER
LANGUAGE SQL
SECURITY DEFINER
SET search_path = 'public'
AS $$
  UPDATE user_notifications 
  SET 
    is_read = true,
    read_at = NOW(),
    updated_at = NOW()
  WHERE user_id = p_user_id 
    AND is_read = false
  RETURNING (SELECT COUNT(*) FROM user_notifications WHERE user_id = p_user_id AND is_read = true);
$$;

-- =====================================================
-- 6. POLÍTICAS RLS (ROW LEVEL SECURITY)
-- =====================================================

-- Habilitar RLS nas tabelas
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

-- Políticas para notifications
-- Owners e admins podem ver todas as notificações
CREATE POLICY "Owners and admins can view all notifications" ON notifications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- Owners e admins podem criar notificações
CREATE POLICY "Owners and admins can create notifications" ON notifications
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- Owners e admins podem atualizar notificações
CREATE POLICY "Owners and admins can update notifications" ON notifications
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- Políticas para user_notifications
-- Usuários podem ver suas próprias notificações
CREATE POLICY "Users can view their own notifications" ON user_notifications
  FOR SELECT USING (user_id = auth.uid());

-- Usuários podem atualizar suas próprias notificações (marcar como lida)
CREATE POLICY "Users can update their own notifications" ON user_notifications
  FOR UPDATE USING (user_id = auth.uid());

-- Sistema pode inserir notificações para usuários
CREATE POLICY "System can insert user notifications" ON user_notifications
  FOR INSERT WITH CHECK (true);

-- Políticas para push_subscriptions
-- Usuários podem gerenciar suas próprias subscriptions
CREATE POLICY "Users can manage their own push subscriptions" ON push_subscriptions
  FOR ALL USING (user_id = auth.uid());

-- Políticas para notification_settings
-- Usuários podem gerenciar suas próprias configurações
CREATE POLICY "Users can manage their own notification settings" ON notification_settings
  FOR ALL USING (user_id = auth.uid() OR user_id IS NULL);

-- Owners e admins podem ver configurações globais
CREATE POLICY "Owners and admins can view global settings" ON notification_settings
  FOR SELECT USING (
    user_id IS NULL AND EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- =====================================================
-- 7. TRIGGERS PARA UPDATED_AT
-- =====================================================

-- Função para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para atualizar updated_at automaticamente
CREATE TRIGGER update_notifications_updated_at 
  BEFORE UPDATE ON notifications 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_notifications_updated_at 
  BEFORE UPDATE ON user_notifications 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_push_subscriptions_updated_at 
  BEFORE UPDATE ON push_subscriptions 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_settings_updated_at 
  BEFORE UPDATE ON notification_settings 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 8. COMENTÁRIOS E DOCUMENTAÇÃO
-- =====================================================

COMMENT ON TABLE notifications IS 'Tabela principal de notificações do sistema';
COMMENT ON TABLE user_notifications IS 'Relacionamento entre notificações e usuários, controla status de leitura';
COMMENT ON TABLE push_subscriptions IS 'Subscriptions de push notifications para PWA';
COMMENT ON TABLE notification_settings IS 'Configurações de notificações por usuário e globais';

COMMENT ON FUNCTION get_unread_notifications_count(UUID) IS 'Retorna o número de notificações não lidas de um usuário';
COMMENT ON FUNCTION mark_notification_as_read(UUID, UUID) IS 'Marca uma notificação específica como lida';
COMMENT ON FUNCTION mark_all_notifications_as_read(UUID) IS 'Marca todas as notificações de um usuário como lidas';

-- =====================================================
-- 9. DADOS INICIAIS
-- =====================================================

-- Inserir configurações globais padrão
INSERT INTO notification_settings (
  user_id,
  enable_push_notifications,
  enable_sale_notifications,
  enable_admin_notifications,
  enable_system_notifications,
  max_notifications_per_hour
) VALUES (
  NULL, -- Configuração global
  true,
  true,
  true,
  true,
  10
) ON CONFLICT (user_id) DO NOTHING;

-- =====================================================
-- FINALIZAÇÃO
-- =====================================================

-- Verificar se tudo foi criado corretamente
DO $$
BEGIN
  RAISE NOTICE '✅ Sistema de notificações criado com sucesso!';
  RAISE NOTICE '📊 Tabelas criadas: notifications, user_notifications, push_subscriptions, notification_settings';
  RAISE NOTICE '🔧 Funções criadas: get_unread_notifications_count, mark_notification_as_read, mark_all_notifications_as_read';
  RAISE NOTICE '🛡️ Políticas RLS configuradas para todos os roles';
  RAISE NOTICE '⚡ Triggers de updated_at configurados';
  RAISE NOTICE '🎯 Sistema pronto para uso!';
END $$;
