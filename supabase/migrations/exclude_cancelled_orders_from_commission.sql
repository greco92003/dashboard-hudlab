-- Exclude cancelled orders from commission calculations
-- This migration updates all commission-related functions to exclude orders with status = 'cancelled'
-- 
-- Problem: Orders with payment_status = 'paid' but status = 'cancelled' were being counted
-- Solution: Add filter to exclude cancelled orders from all commission calculations
--
-- According to Nuvemshop API documentation:
-- - status: can be "open", "closed", or "cancelled"
-- - payment_status: can be "authorized", "pending", "paid", "voided", "refunded"
-- 
-- A cancelled order should NOT count towards commission even if payment was processed

-- =====================================================
-- UPDATE FUNCTION: get_brand_commission_total
-- =====================================================

-- Function to get total commission earned for a brand in a period
-- Updated to exclude cancelled orders
CREATE OR REPLACE FUNCTION get_brand_commission_total(
  p_brand TEXT,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS DECIMAL(10,2)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE(
    SUM(
      CASE 
        WHEN no.subtotal IS NOT NULL AND no.promotional_discount IS NOT NULL THEN
          ((no.subtotal - COALESCE(no.promotional_discount, 0)) * 
           COALESCE(
             (SELECT percentage FROM partners_commission_settings 
              WHERE brand = p_brand 
              ORDER BY updated_at DESC LIMIT 1), 
             5.0
           ) / 100)
        ELSE 0
      END
    ), 
    0
  )
  FROM nuvemshop_orders no
  JOIN nuvemshop_products np ON (no.products::jsonb @> jsonb_build_array(jsonb_build_object('name', np.name)))
  WHERE np.brand = p_brand
    AND no.payment_status = 'paid'
    AND no.status != 'cancelled'  -- EXCLUDE CANCELLED ORDERS
    AND no.completed_at IS NOT NULL
    AND (p_start_date IS NULL OR no.completed_at::date >= p_start_date)
    AND (p_end_date IS NULL OR no.completed_at::date <= p_end_date);
$$;

-- =====================================================
-- CREATE INDEX FOR BETTER PERFORMANCE
-- =====================================================

-- Create index on status column for better query performance
CREATE INDEX IF NOT EXISTS idx_nuvemshop_orders_status ON nuvemshop_orders(status);

-- Create composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_nuvemshop_orders_payment_status_status 
ON nuvemshop_orders(payment_status, status);

-- =====================================================
-- UPDATE FUNCTION COMMENTS
-- =====================================================

COMMENT ON FUNCTION get_brand_commission_total(TEXT, DATE, DATE) IS 
'Calculates total commission earned for a brand in a given period using brand-specific commission rates. Excludes cancelled orders.';

COMMENT ON COLUMN nuvemshop_orders.status IS 
'Order status from Nuvemshop API. Possible values: "open", "closed", "cancelled". Cancelled orders are excluded from commission calculations.';

-- =====================================================
-- VERIFICATION QUERY
-- =====================================================

-- To verify the migration worked correctly, run this query:
-- SELECT 
--   COUNT(*) FILTER (WHERE payment_status = 'paid' AND status = 'cancelled') as cancelled_paid_orders,
--   COUNT(*) FILTER (WHERE payment_status = 'paid' AND status != 'cancelled') as valid_paid_orders,
--   COUNT(*) FILTER (WHERE payment_status = 'paid') as total_paid_orders
-- FROM nuvemshop_orders;

