-- Fix RLS policy for affiliate_links table to use optimized auth.uid() function
-- This prevents re-evaluation per row and improves performance

-- Drop existing policy
DROP POLICY IF EXISTS "Allow admin and owner to manage affiliate links" ON affiliate_links;

-- Create updated policy with optimized auth.uid() function
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

-- Add comment for documentation
COMMENT ON POLICY "Allow admin and owner to manage affiliate links" ON affiliate_links IS 'Allows admin and owner users to create, read, update, and delete affiliate links. Uses optimized auth.uid() function to prevent re-evaluation per row.';
