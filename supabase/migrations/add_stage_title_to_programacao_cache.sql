-- Add stage_title column to programacao_cache table
-- This column will store the stage title from ActiveCampaign dealStages

ALTER TABLE programacao_cache 
ADD COLUMN IF NOT EXISTS stage_title TEXT;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_programacao_cache_stage_title 
ON programacao_cache(stage_title) 
WHERE stage_title IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN programacao_cache.stage_title IS 'Stage title from ActiveCampaign dealStages API';

