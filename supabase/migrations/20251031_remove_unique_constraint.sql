-- Remove unique constraint to allow duplicate rows
-- Each row in the Google Sheet represents a separate action that should be counted
-- Even if the same business has multiple mockups/alterations on the same day
-- Migration date: 2025-10-31

-- Drop the unique constraint that prevents duplicates
DROP INDEX IF EXISTS idx_designer_mockups_cache_unique_fixed;
DROP INDEX IF EXISTS idx_designer_mockups_cache_unique;

-- Remove the check constraint that prevents empty strings
ALTER TABLE designer_mockups_cache 
DROP CONSTRAINT IF EXISTS check_atualizado_em_raw_not_empty;

-- Add comment explaining why we don't have a unique constraint
COMMENT ON TABLE designer_mockups_cache IS 
'Cache table for designer mockups data from Google Sheets. 
Each row represents a separate action/entry from the sheet.
Duplicates are allowed because the same business can have multiple mockups or alterations on the same day.';

