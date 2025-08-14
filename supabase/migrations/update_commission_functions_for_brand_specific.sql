-- Update commission functions to use brand-specific commission rates
-- This migration updates the get_brand_commission_total function to use 
-- commission settings specific to each brand instead of a global setting

-- =====================================================
-- UPDATE FUNCTION TO USE BRAND-SPECIFIC COMMISSION
-- =====================================================

-- Function to get total commission earned for a brand in a period
-- Updated to use brand-specific commission settings
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
    AND no.completed_at IS NOT NULL
    AND (p_start_date IS NULL OR no.completed_at::date >= p_start_date)
    AND (p_end_date IS NULL OR no.completed_at::date <= p_end_date);
$$;

-- =====================================================
-- UPDATE FUNCTION COMMENTS
-- =====================================================

COMMENT ON FUNCTION get_brand_commission_total(TEXT, DATE, DATE) IS 
'Calculates total commission earned for a brand in a given period using brand-specific commission rates';

-- =====================================================
-- VERIFICATION
-- =====================================================

-- Verify the function was updated correctly
SELECT 
  routine_name,
  routine_definition
FROM information_schema.routines 
WHERE routine_name = 'get_brand_commission_total'
AND routine_schema = 'public';
