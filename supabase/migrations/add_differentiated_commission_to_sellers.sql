-- Migration: Adicionar comissões diferenciadas por tipo de tráfego aos vendedores
-- Data: 2026-01-15
-- Descrição: Permite configurar % de comissão diferentes para tráfego pago e orgânico

-- Adicionar colunas de comissão diferenciada à tabela ote_sellers
ALTER TABLE ote_sellers
ADD COLUMN IF NOT EXISTS commission_paid_traffic DECIMAL(5,2) DEFAULT 2.00 NOT NULL,
ADD COLUMN IF NOT EXISTS commission_organic DECIMAL(5,2) DEFAULT 4.00 NOT NULL;

-- Comentários explicativos
COMMENT ON COLUMN ote_sellers.commission_paid_traffic IS '% de comissão para vendas de tráfego pago (ex: 2%)';
COMMENT ON COLUMN ote_sellers.commission_organic IS '% de comissão para vendas de tráfego orgânico (ex: 4%)';

-- Migrar dados existentes: usar o valor de commission_percentage como base
-- Tráfego pago = commission_percentage (ex: 2%)
-- Tráfego orgânico = commission_percentage * 2 (ex: 4%)
UPDATE ote_sellers
SET 
  commission_paid_traffic = commission_percentage,
  commission_organic = commission_percentage * 2
WHERE commission_paid_traffic IS NULL OR commission_organic IS NULL;

-- Manter a coluna commission_percentage para compatibilidade, mas ela não será mais usada nos cálculos
COMMENT ON COLUMN ote_sellers.commission_percentage IS 'DEPRECATED: Use commission_paid_traffic e commission_organic. Mantido para compatibilidade.';

