-- Add franchise column to commission_payments table for Zenith brand franchise-specific commission tracking
-- This allows tracking commission payments separately for each Zenith franchise (Santos-SP, Garopaba-SC, Taquara-RS)

-- Add franchise column (nullable for backward compatibility and non-Zenith brands)
ALTER TABLE commission_payments 
ADD COLUMN IF NOT EXISTS franchise TEXT;

-- Create index for better performance when filtering by franchise
CREATE INDEX IF NOT EXISTS idx_commission_payments_franchise ON commission_payments(franchise);

-- Create composite index for brand + franchise queries
CREATE INDEX IF NOT EXISTS idx_commission_payments_brand_franchise ON commission_payments(brand, franchise);

-- Add comment to explain the column
COMMENT ON COLUMN commission_payments.franchise IS 'Franchise name for Zenith brand (Santos-SP, Garopaba-SC, Taquara-RS). NULL for non-Zenith brands or brand-wide payments.';

