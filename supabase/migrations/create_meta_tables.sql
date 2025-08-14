-- =====================================================
-- TABELAS PARA META MARKETING API
-- =====================================================
-- Criação das tabelas para armazenar dados da Meta Marketing API

-- Tabela para contas de anúncios Meta
CREATE TABLE IF NOT EXISTS meta_ad_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  meta_account_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  account_status INTEGER NOT NULL,
  currency TEXT NOT NULL,
  timezone_name TEXT NOT NULL,
  balance TEXT,
  business_id TEXT,
  business_name TEXT,
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Tabela para campanhas Meta
CREATE TABLE IF NOT EXISTS meta_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  meta_campaign_id TEXT UNIQUE NOT NULL,
  meta_account_id TEXT NOT NULL REFERENCES meta_ad_accounts(meta_account_id),
  name TEXT NOT NULL,
  objective TEXT NOT NULL,
  status TEXT NOT NULL,
  effective_status TEXT NOT NULL,
  daily_budget DECIMAL(10,2),
  lifetime_budget DECIMAL(10,2),
  budget_remaining DECIMAL(10,2),
  bid_strategy TEXT,
  start_time TIMESTAMPTZ,
  stop_time TIMESTAMPTZ,
  meta_created_time TIMESTAMPTZ NOT NULL,
  meta_updated_time TIMESTAMPTZ NOT NULL,
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Tabela para conjuntos de anúncios (Ad Sets)
CREATE TABLE IF NOT EXISTS meta_ad_sets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  meta_adset_id TEXT UNIQUE NOT NULL,
  meta_campaign_id TEXT NOT NULL REFERENCES meta_campaigns(meta_campaign_id),
  meta_account_id TEXT NOT NULL REFERENCES meta_ad_accounts(meta_account_id),
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  effective_status TEXT NOT NULL,
  daily_budget DECIMAL(10,2),
  lifetime_budget DECIMAL(10,2),
  bid_amount DECIMAL(10,2),
  billing_event TEXT,
  optimization_goal TEXT,
  targeting JSONB,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  meta_created_time TIMESTAMPTZ NOT NULL,
  meta_updated_time TIMESTAMPTZ NOT NULL,
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Tabela para anúncios individuais
CREATE TABLE IF NOT EXISTS meta_ads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  meta_ad_id TEXT UNIQUE NOT NULL,
  meta_adset_id TEXT NOT NULL REFERENCES meta_ad_sets(meta_adset_id),
  meta_campaign_id TEXT NOT NULL REFERENCES meta_campaigns(meta_campaign_id),
  meta_account_id TEXT NOT NULL REFERENCES meta_ad_accounts(meta_account_id),
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  effective_status TEXT NOT NULL,
  creative_id TEXT,
  creative_data JSONB,
  meta_created_time TIMESTAMPTZ NOT NULL,
  meta_updated_time TIMESTAMPTZ NOT NULL,
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Tabela para criativos de anúncios
CREATE TABLE IF NOT EXISTS meta_ad_creatives (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  meta_creative_id TEXT UNIQUE NOT NULL,
  meta_account_id TEXT NOT NULL REFERENCES meta_ad_accounts(meta_account_id),
  name TEXT NOT NULL,
  title TEXT,
  body TEXT,
  image_url TEXT,
  video_id TEXT,
  call_to_action JSONB,
  object_story_spec JSONB,
  url_tags TEXT,
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Tabela para audiences customizadas
CREATE TABLE IF NOT EXISTS meta_custom_audiences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  meta_audience_id TEXT UNIQUE NOT NULL,
  meta_account_id TEXT NOT NULL REFERENCES meta_ad_accounts(meta_account_id),
  name TEXT NOT NULL,
  description TEXT,
  subtype TEXT NOT NULL,
  approximate_count INTEGER,
  data_source JSONB,
  retention_days INTEGER,
  rule JSONB,
  operation_status JSONB,
  meta_creation_time TIMESTAMPTZ NOT NULL,
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Tabela para métricas de insights/performance
CREATE TABLE IF NOT EXISTS meta_insights (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  meta_object_id TEXT NOT NULL, -- ID do objeto (campaign, adset, ad)
  meta_object_type TEXT NOT NULL, -- Tipo: campaign, adset, ad, account
  meta_account_id TEXT NOT NULL REFERENCES meta_ad_accounts(meta_account_id),
  date_start DATE NOT NULL,
  date_stop DATE NOT NULL,
  impressions BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  spend DECIMAL(10,2) DEFAULT 0,
  reach BIGINT DEFAULT 0,
  frequency DECIMAL(10,4) DEFAULT 0,
  ctr DECIMAL(10,4) DEFAULT 0,
  cpc DECIMAL(10,4) DEFAULT 0,
  cpm DECIMAL(10,4) DEFAULT 0,
  cpp DECIMAL(10,4) DEFAULT 0,
  video_views BIGINT DEFAULT 0,
  video_view_time BIGINT DEFAULT 0,
  actions JSONB,
  cost_per_action_type JSONB,
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(meta_object_id, meta_object_type, date_start, date_stop)
);

-- Tabela para log de sincronizações
CREATE TABLE IF NOT EXISTS meta_sync_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_type TEXT NOT NULL, -- accounts, campaigns, adsets, ads, insights, etc.
  status TEXT NOT NULL, -- running, completed, failed
  meta_account_id TEXT REFERENCES meta_ad_accounts(meta_account_id),
  records_processed INTEGER DEFAULT 0,
  records_success INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_meta_campaigns_account_id ON meta_campaigns(meta_account_id);
CREATE INDEX IF NOT EXISTS idx_meta_campaigns_status ON meta_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_meta_campaigns_effective_status ON meta_campaigns(effective_status);
CREATE INDEX IF NOT EXISTS idx_meta_campaigns_created_time ON meta_campaigns(meta_created_time);

CREATE INDEX IF NOT EXISTS idx_meta_ad_sets_campaign_id ON meta_ad_sets(meta_campaign_id);
CREATE INDEX IF NOT EXISTS idx_meta_ad_sets_account_id ON meta_ad_sets(meta_account_id);
CREATE INDEX IF NOT EXISTS idx_meta_ad_sets_status ON meta_ad_sets(status);

CREATE INDEX IF NOT EXISTS idx_meta_ads_adset_id ON meta_ads(meta_adset_id);
CREATE INDEX IF NOT EXISTS idx_meta_ads_campaign_id ON meta_ads(meta_campaign_id);
CREATE INDEX IF NOT EXISTS idx_meta_ads_account_id ON meta_ads(meta_account_id);
CREATE INDEX IF NOT EXISTS idx_meta_ads_status ON meta_ads(status);

CREATE INDEX IF NOT EXISTS idx_meta_insights_object_id ON meta_insights(meta_object_id);
CREATE INDEX IF NOT EXISTS idx_meta_insights_object_type ON meta_insights(meta_object_type);
CREATE INDEX IF NOT EXISTS idx_meta_insights_account_id ON meta_insights(meta_account_id);
CREATE INDEX IF NOT EXISTS idx_meta_insights_date_range ON meta_insights(date_start, date_stop);

CREATE INDEX IF NOT EXISTS idx_meta_sync_log_type ON meta_sync_log(sync_type);
CREATE INDEX IF NOT EXISTS idx_meta_sync_log_status ON meta_sync_log(status);
CREATE INDEX IF NOT EXISTS idx_meta_sync_log_started_at ON meta_sync_log(started_at);

-- Triggers para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_meta_ad_accounts_updated_at BEFORE UPDATE ON meta_ad_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_meta_campaigns_updated_at BEFORE UPDATE ON meta_campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_meta_ad_sets_updated_at BEFORE UPDATE ON meta_ad_sets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_meta_ads_updated_at BEFORE UPDATE ON meta_ads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_meta_ad_creatives_updated_at BEFORE UPDATE ON meta_ad_creatives FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_meta_custom_audiences_updated_at BEFORE UPDATE ON meta_custom_audiences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_meta_insights_updated_at BEFORE UPDATE ON meta_insights FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS (Row Level Security) policies
ALTER TABLE meta_ad_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ad_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ad_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_custom_audiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_sync_log ENABLE ROW LEVEL SECURITY;

-- Políticas RLS básicas (usuários aprovados podem ver todos os dados)
CREATE POLICY "Users can view Meta data if approved" ON meta_ad_accounts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.approved = true
    )
  );

CREATE POLICY "Admins can manage Meta accounts" ON meta_ad_accounts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.role IN ('admin', 'owner')
      AND user_profiles.approved = true
    )
  );

-- Aplicar políticas similares para outras tabelas
CREATE POLICY "Users can view Meta campaigns if approved" ON meta_campaigns FOR SELECT USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.approved = true));
CREATE POLICY "Admins can manage Meta campaigns" ON meta_campaigns FOR ALL USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('admin', 'owner') AND user_profiles.approved = true));

CREATE POLICY "Users can view Meta ad sets if approved" ON meta_ad_sets FOR SELECT USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.approved = true));
CREATE POLICY "Admins can manage Meta ad sets" ON meta_ad_sets FOR ALL USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('admin', 'owner') AND user_profiles.approved = true));

CREATE POLICY "Users can view Meta ads if approved" ON meta_ads FOR SELECT USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.approved = true));
CREATE POLICY "Admins can manage Meta ads" ON meta_ads FOR ALL USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('admin', 'owner') AND user_profiles.approved = true));

CREATE POLICY "Users can view Meta creatives if approved" ON meta_ad_creatives FOR SELECT USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.approved = true));
CREATE POLICY "Admins can manage Meta creatives" ON meta_ad_creatives FOR ALL USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('admin', 'owner') AND user_profiles.approved = true));

CREATE POLICY "Users can view Meta audiences if approved" ON meta_custom_audiences FOR SELECT USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.approved = true));
CREATE POLICY "Admins can manage Meta audiences" ON meta_custom_audiences FOR ALL USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('admin', 'owner') AND user_profiles.approved = true));

CREATE POLICY "Users can view Meta insights if approved" ON meta_insights FOR SELECT USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.approved = true));
CREATE POLICY "Admins can manage Meta insights" ON meta_insights FOR ALL USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('admin', 'owner') AND user_profiles.approved = true));

CREATE POLICY "Users can view Meta sync log if approved" ON meta_sync_log FOR SELECT USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.approved = true));
CREATE POLICY "Admins can manage Meta sync log" ON meta_sync_log FOR ALL USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('admin', 'owner') AND user_profiles.approved = true));
