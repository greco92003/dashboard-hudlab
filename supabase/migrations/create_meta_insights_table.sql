-- =====================================================
-- TABELA PARA ARMAZENAR INSIGHTS DA META API
-- =====================================================
-- Tabela para cache de insights de campanhas, ad sets e anúncios

-- Tabela para insights (métricas de performance)
CREATE TABLE IF NOT EXISTS meta_insights (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  meta_object_id TEXT NOT NULL, -- ID do objeto (campaign, adset, ou ad)
  object_level TEXT NOT NULL CHECK (object_level IN ('campaign', 'adset', 'ad')),
  meta_account_id TEXT NOT NULL REFERENCES meta_ad_accounts(meta_account_id),
  
  -- Período dos dados
  date_start DATE NOT NULL,
  date_stop DATE NOT NULL,
  date_preset TEXT NOT NULL, -- 'last_30d', 'last_7d', etc.
  
  -- Métricas principais
  spend DECIMAL(12,2) DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  conversions DECIMAL(10,2) DEFAULT 0,
  
  -- Métricas calculadas
  cpc DECIMAL(10,4) DEFAULT 0, -- Cost per click
  cpm DECIMAL(10,4) DEFAULT 0, -- Cost per mille (1000 impressions)
  ctr DECIMAL(8,4) DEFAULT 0, -- Click-through rate
  cost_per_conversion DECIMAL(10,4) DEFAULT 0,
  
  -- Métricas adicionais
  reach INTEGER DEFAULT 0,
  frequency DECIMAL(8,4) DEFAULT 0,
  video_views INTEGER DEFAULT 0,
  
  -- Metadados
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  
  -- Constraint única para evitar duplicatas
  UNIQUE(meta_object_id, object_level, date_start, date_stop, date_preset)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_meta_insights_object_id ON meta_insights(meta_object_id);
CREATE INDEX IF NOT EXISTS idx_meta_insights_account_id ON meta_insights(meta_account_id);
CREATE INDEX IF NOT EXISTS idx_meta_insights_level ON meta_insights(object_level);
CREATE INDEX IF NOT EXISTS idx_meta_insights_date_range ON meta_insights(date_start, date_stop);
CREATE INDEX IF NOT EXISTS idx_meta_insights_date_preset ON meta_insights(date_preset);
CREATE INDEX IF NOT EXISTS idx_meta_insights_last_synced ON meta_insights(last_synced_at);

-- Índice composto para consultas comuns
CREATE INDEX IF NOT EXISTS idx_meta_insights_lookup ON meta_insights(meta_account_id, object_level, date_preset, date_start DESC);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_meta_insights_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_meta_insights_updated_at
  BEFORE UPDATE ON meta_insights
  FOR EACH ROW
  EXECUTE FUNCTION update_meta_insights_updated_at();

-- RLS (Row Level Security)
ALTER TABLE meta_insights ENABLE ROW LEVEL SECURITY;

-- Política para usuários aprovados
CREATE POLICY "Users can view insights for their accessible accounts" ON meta_insights
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.approved = true
    )
  );

-- Política para inserção (apenas usuários aprovados)
CREATE POLICY "Approved users can insert insights" ON meta_insights
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.approved = true
    )
  );

-- Política para atualização (apenas usuários aprovados)
CREATE POLICY "Approved users can update insights" ON meta_insights
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.approved = true
    )
  );

-- View para insights agregados por objeto
CREATE OR REPLACE VIEW meta_insights_summary AS
SELECT 
  meta_object_id,
  object_level,
  meta_account_id,
  date_preset,
  MIN(date_start) as period_start,
  MAX(date_stop) as period_end,
  SUM(spend) as total_spend,
  SUM(impressions) as total_impressions,
  SUM(clicks) as total_clicks,
  SUM(conversions) as total_conversions,
  CASE 
    WHEN SUM(clicks) > 0 THEN SUM(spend) / SUM(clicks)
    ELSE 0 
  END as avg_cpc,
  CASE 
    WHEN SUM(impressions) > 0 THEN (SUM(spend) / SUM(impressions)) * 1000
    ELSE 0 
  END as avg_cpm,
  CASE 
    WHEN SUM(impressions) > 0 THEN (SUM(clicks)::DECIMAL / SUM(impressions)) * 100
    ELSE 0 
  END as avg_ctr,
  CASE 
    WHEN SUM(conversions) > 0 THEN SUM(spend) / SUM(conversions)
    ELSE 0 
  END as avg_cost_per_conversion,
  SUM(reach) as total_reach,
  CASE 
    WHEN SUM(reach) > 0 THEN SUM(impressions)::DECIMAL / SUM(reach)
    ELSE 0 
  END as avg_frequency,
  SUM(video_views) as total_video_views,
  MAX(last_synced_at) as last_synced_at,
  COUNT(*) as insight_records
FROM meta_insights
GROUP BY meta_object_id, object_level, meta_account_id, date_preset;

-- Comentários para documentação
COMMENT ON TABLE meta_insights IS 'Cache de insights (métricas) da Meta API para campanhas, ad sets e anúncios';
COMMENT ON COLUMN meta_insights.meta_object_id IS 'ID do objeto Meta (campaign_id, adset_id, ou ad_id)';
COMMENT ON COLUMN meta_insights.object_level IS 'Nível do objeto: campaign, adset, ou ad';
COMMENT ON COLUMN meta_insights.date_preset IS 'Preset de data usado na consulta (last_30d, last_7d, etc.)';
COMMENT ON COLUMN meta_insights.spend IS 'Valor gasto em reais (já convertido de centavos)';
COMMENT ON COLUMN meta_insights.cpc IS 'Custo por clique em reais';
COMMENT ON COLUMN meta_insights.cpm IS 'Custo por mil impressões em reais';
COMMENT ON COLUMN meta_insights.ctr IS 'Taxa de cliques em porcentagem';
COMMENT ON VIEW meta_insights_summary IS 'View agregada de insights por objeto e período';
