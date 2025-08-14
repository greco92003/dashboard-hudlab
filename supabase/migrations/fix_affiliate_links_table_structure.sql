-- Fix affiliate_links table structure to match the expected schema
-- The table currently has title and description columns that are not in our migration
-- This migration makes title nullable and adds proper defaults

-- Make title column nullable since it's not required for basic affiliate link functionality
ALTER TABLE affiliate_links 
ALTER COLUMN title DROP NOT NULL;

-- Add default value for title column to prevent future issues
ALTER TABLE affiliate_links 
ALTER COLUMN title SET DEFAULT 'Affiliate Link';

-- Ensure description column exists and is nullable (it should already be)
ALTER TABLE affiliate_links 
ADD COLUMN IF NOT EXISTS description TEXT;

-- Update any existing records that have null titles
UPDATE affiliate_links 
SET title = 'Affiliate Link' 
WHERE title IS NULL;

-- Add comments for the new columns
COMMENT ON COLUMN affiliate_links.title IS 'Title/name for the affiliate link (optional)';
COMMENT ON COLUMN affiliate_links.description IS 'Optional description for the affiliate link';

-- Verify the table structure
-- SELECT column_name, data_type, is_nullable, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'affiliate_links' AND table_schema = 'public' 
-- ORDER BY ordinal_position;
