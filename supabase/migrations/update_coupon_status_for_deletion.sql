-- Update generated_coupons table to support deletion status
-- Add 'deleted' status to nuvemshop_status field

-- Drop the existing constraint
ALTER TABLE generated_coupons 
DROP CONSTRAINT IF EXISTS generated_coupons_nuvemshop_status_check;

-- Add the new constraint with 'deleted' status
ALTER TABLE generated_coupons 
ADD CONSTRAINT generated_coupons_nuvemshop_status_check 
CHECK (nuvemshop_status IN ('pending', 'created', 'error', 'deleted'));

-- Add index for deleted status queries
CREATE INDEX IF NOT EXISTS idx_generated_coupons_nuvemshop_status_deleted 
ON generated_coupons(nuvemshop_status) 
WHERE nuvemshop_status = 'deleted';

-- Add index for active coupons (not deleted)
CREATE INDEX IF NOT EXISTS idx_generated_coupons_active_not_deleted 
ON generated_coupons(is_active, nuvemshop_status) 
WHERE is_active = true AND nuvemshop_status != 'deleted';

-- Add comment
COMMENT ON COLUMN generated_coupons.nuvemshop_status IS 
'Status of the coupon in NuvemShop: pending (not yet created), created (successfully created), error (creation failed), deleted (removed from NuvemShop)';
