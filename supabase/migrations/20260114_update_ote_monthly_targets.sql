-- =====================================================
-- ATUALIZAR TABELA OTE_MONTHLY_TARGETS
-- =====================================================
-- Modificar para ter uma meta mensal única para toda a empresa
-- Todos os vendedores trabalham juntos para bater essa meta

-- 1. Remover políticas RLS antigas que dependem de seller_id
DROP POLICY IF EXISTS "Vendedores podem ver suas próprias metas" ON ote_monthly_targets;
DROP POLICY IF EXISTS "Admins e owners podem gerenciar metas" ON ote_monthly_targets;

-- 2. Remover dados existentes (se houver) - com CASCADE
TRUNCATE TABLE ote_monthly_targets CASCADE;

-- 3. Remover a coluna seller_id com CASCADE
ALTER TABLE ote_monthly_targets
DROP COLUMN IF EXISTS seller_id CASCADE;

-- 4. Adicionar constraint UNIQUE para month + year
-- Garante que só pode haver uma meta por mês
ALTER TABLE ote_monthly_targets
ADD CONSTRAINT ote_monthly_targets_month_year_unique
UNIQUE (month, year);

-- 5. Adicionar comentário na tabela
COMMENT ON TABLE ote_monthly_targets IS 'Meta mensal única da empresa. Todos os vendedores trabalham juntos para atingir essa meta.';

-- 6. Adicionar comentários nas colunas
COMMENT ON COLUMN ote_monthly_targets.month IS 'Mês da meta (1-12)';
COMMENT ON COLUMN ote_monthly_targets.year IS 'Ano da meta';
COMMENT ON COLUMN ote_monthly_targets.target_amount IS 'Valor total da meta mensal da empresa em reais';

-- 7. Recriar políticas RLS (todos podem ver as metas)
CREATE POLICY "Usuários aprovados podem ver metas" ON ote_monthly_targets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.approved = true
    )
  );

CREATE POLICY "Admins e owners podem gerenciar metas" ON ote_monthly_targets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'owner')
    )
  );

-- 8. Inserir meta de exemplo para Janeiro 2026
INSERT INTO ote_monthly_targets (month, year, target_amount)
VALUES (1, 2026, 150000.00)
ON CONFLICT (month, year) DO NOTHING;

-- Sucesso!
SELECT 'Tabela ote_monthly_targets atualizada com sucesso!' as message;

