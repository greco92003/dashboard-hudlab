-- Create affiliate_links table for managing partner affiliate links
CREATE TABLE IF NOT EXISTS affiliate_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Link information
  url TEXT NOT NULL,
  brand TEXT NOT NULL, -- Brand that this affiliate link belongs to

  -- Metadata
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_affiliate_links_active ON affiliate_links(is_active);
CREATE INDEX IF NOT EXISTS idx_affiliate_links_created_by ON affiliate_links(created_by);
CREATE INDEX IF NOT EXISTS idx_affiliate_links_created_at ON affiliate_links(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_links_brand ON affiliate_links(brand);
CREATE INDEX IF NOT EXISTS idx_affiliate_links_brand_active ON affiliate_links(brand, is_active);

-- Enable RLS
ALTER TABLE affiliate_links ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Allow all authenticated users to read active affiliate links
CREATE POLICY "Allow authenticated users to read active affiliate links"
ON affiliate_links
FOR SELECT
TO authenticated
USING (is_active = true);

-- Allow admin and owner to manage affiliate links
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

-- Add comments
COMMENT ON TABLE affiliate_links IS 'Stores affiliate links that can be managed by admins/owners and viewed by partners-media. Each brand has its own affiliate link.';
COMMENT ON COLUMN affiliate_links.url IS 'The affiliate URL';
COMMENT ON COLUMN affiliate_links.brand IS 'Brand that this affiliate link belongs to';
COMMENT ON COLUMN affiliate_links.created_by IS 'User who created this affiliate link';
COMMENT ON COLUMN affiliate_links.is_active IS 'Whether the link is currently active and visible';

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_affiliate_links_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER trigger_affiliate_links_updated_at
  BEFORE UPDATE ON affiliate_links
  FOR EACH ROW
  EXECUTE FUNCTION update_affiliate_links_updated_at();
