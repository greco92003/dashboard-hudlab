-- Fix the unique constraint issue in designer_mockups_cache table
-- The current constraint fails when atualizado_em_raw is empty string
-- We need to handle NULL values properly

-- Drop the existing unique constraint
DROP INDEX IF EXISTS idx_designer_mockups_cache_unique;

-- Create a new unique constraint that handles NULL values properly
-- This will treat empty strings as NULL for the constraint
CREATE UNIQUE INDEX idx_designer_mockups_cache_unique_fixed 
ON designer_mockups_cache(
  nome_negocio, 
  designer, 
  etapa_funil, 
  COALESCE(NULLIF(atualizado_em_raw, ''), 'NULL_PLACEHOLDER')
);

-- Add comment explaining the constraint
COMMENT ON INDEX idx_designer_mockups_cache_unique_fixed IS 'Unique constraint that properly handles empty strings in atualizado_em_raw by treating them as NULL';

-- Update any existing empty strings to NULL for consistency
UPDATE designer_mockups_cache 
SET atualizado_em_raw = NULL 
WHERE atualizado_em_raw = '';

-- Add a check constraint to prevent empty strings in the future
ALTER TABLE designer_mockups_cache 
ADD CONSTRAINT check_atualizado_em_raw_not_empty 
CHECK (atualizado_em_raw IS NULL OR atualizado_em_raw != '');
