-- Add brand column to affiliate_links table and update RLS policies
-- This migration updates the existing affiliate_links table to support brand-specific links

-- =====================================================
-- 1. ADD BRAND COLUMN TO EXISTING TABLE
-- =====================================================

-- Add brand column to affiliate_links table
ALTER TABLE affiliate_links 
ADD COLUMN IF NOT EXISTS brand TEXT;

-- Create indexes for better performance with brand filtering
CREATE INDEX IF NOT EXISTS idx_affiliate_links_brand ON affiliate_links(brand);
CREATE INDEX IF NOT EXISTS idx_affiliate_links_brand_active ON affiliate_links(brand, is_active);

-- =====================================================
-- 2. UPDATE RLS POLICIES FOR BRAND FILTERING
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Allow authenticated users to read active affiliate links" ON affiliate_links;
DROP POLICY IF EXISTS "Allow admin and owner to manage affiliate links" ON affiliate_links;

-- Create new policy for reading affiliate links with brand filtering
CREATE POLICY "Allow users to read affiliate links for their brand"
ON affiliate_links
FOR SELECT
TO authenticated
USING (
  is_active = true AND (
    -- Owners and admins can see all brands
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = (select auth.uid()) 
      AND user_profiles.role IN ('admin', 'owner')
      AND user_profiles.approved = true
    )
    OR
    -- Partners-media can only see links for their assigned brand
    (
      EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE user_profiles.id = (select auth.uid()) 
        AND user_profiles.role = 'partners-media'
        AND user_profiles.approved = true
        AND user_profiles.assigned_brand = affiliate_links.brand
      )
    )
  )
);

-- Create policy for managing affiliate links (admin/owner only)
CREATE POLICY "Allow admin and owner to manage affiliate links"
ON affiliate_links
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE user_profiles.id = (select auth.uid()) 
    AND user_profiles.role IN ('admin', 'owner')
    AND user_profiles.approved = true
  )
);

-- =====================================================
-- 3. UPDATE COMMENTS
-- =====================================================

COMMENT ON COLUMN affiliate_links.brand IS 'Brand that this affiliate link belongs to. Each brand has its own unique affiliate link.';

-- =====================================================
-- 4. CREATE UNIQUE CONSTRAINT FOR BRAND
-- =====================================================

-- Ensure only one active affiliate link per brand
CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliate_links_unique_brand_active 
ON affiliate_links(brand) 
WHERE is_active = true;

-- Add comment for the unique constraint
COMMENT ON INDEX idx_affiliate_links_unique_brand_active IS 'Ensures only one active affiliate link exists per brand';
