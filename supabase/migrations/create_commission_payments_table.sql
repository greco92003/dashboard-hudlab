-- Create commission_payments table for tracking commission payments to partners
CREATE TABLE IF NOT EXISTS commission_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Partner information
  brand TEXT NOT NULL, -- Brand that this payment belongs to
  partner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Partner who receives the payment
  
  -- Payment details
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0), -- Payment amount in BRL
  payment_date DATE NOT NULL, -- Date when payment was sent
  description TEXT, -- Optional description/notes about the payment
  
  -- Payment method/reference
  payment_method TEXT DEFAULT 'pix', -- Payment method (pix, bank_transfer, etc.)
  payment_reference TEXT, -- Transaction reference/ID
  
  -- Metadata
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Admin/owner who created the payment record
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Last user who updated the record
  
  -- Status
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'confirmed', 'cancelled')),
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_commission_payments_brand ON commission_payments(brand);
CREATE INDEX IF NOT EXISTS idx_commission_payments_partner_user_id ON commission_payments(partner_user_id);
CREATE INDEX IF NOT EXISTS idx_commission_payments_payment_date ON commission_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_commission_payments_status ON commission_payments(status);
CREATE INDEX IF NOT EXISTS idx_commission_payments_created_by ON commission_payments(created_by);

-- Enable RLS
ALTER TABLE commission_payments ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- ROW LEVEL SECURITY POLICIES
-- =====================================================

-- Policy for owners and admins to manage all commission payments
CREATE POLICY "Owners and admins can manage all commission payments"
ON commission_payments
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role IN ('owner', 'admin')
    AND user_profiles.approved = true
  )
);

-- Policy for partners-media to view their own brand's commission payments (read-only)
CREATE POLICY "Partners-media can view their brand commission payments"
ON commission_payments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role = 'partners-media'
    AND user_profiles.approved = true
    AND user_profiles.assigned_brand = commission_payments.brand
  )
);

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_commission_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER trigger_update_commission_payments_updated_at
  BEFORE UPDATE ON commission_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_commission_payments_updated_at();

-- Function to get total commission earned for a brand in a period
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
           COALESCE((SELECT percentage FROM partners_commission_settings ORDER BY updated_at DESC LIMIT 1), 5.0) / 100)
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

-- Function to get total payments made for a brand
CREATE OR REPLACE FUNCTION get_brand_payments_total(
  p_brand TEXT
)
RETURNS DECIMAL(10,2)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE(SUM(amount), 0)
  FROM commission_payments
  WHERE brand = p_brand
    AND status IN ('sent', 'confirmed');
$$;

-- Function to get commission balance (earned - paid)
CREATE OR REPLACE FUNCTION get_brand_commission_balance(
  p_brand TEXT
)
RETURNS DECIMAL(10,2)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT 
    get_brand_commission_total(p_brand) - get_brand_payments_total(p_brand);
$$;

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE commission_payments IS 'Stores commission payments made to partners-media users by brand';
COMMENT ON COLUMN commission_payments.brand IS 'Brand that this payment belongs to';
COMMENT ON COLUMN commission_payments.partner_user_id IS 'Partner user who receives the payment';
COMMENT ON COLUMN commission_payments.amount IS 'Payment amount in BRL (Brazilian Real)';
COMMENT ON COLUMN commission_payments.payment_date IS 'Date when payment was sent to partner';
COMMENT ON COLUMN commission_payments.description IS 'Optional description or notes about the payment';
COMMENT ON COLUMN commission_payments.payment_method IS 'Payment method used (pix, bank_transfer, etc.)';
COMMENT ON COLUMN commission_payments.payment_reference IS 'Transaction reference or ID for tracking';
COMMENT ON COLUMN commission_payments.created_by IS 'Admin/owner who created this payment record';
COMMENT ON COLUMN commission_payments.updated_by IS 'Last user who updated this payment record';
COMMENT ON COLUMN commission_payments.status IS 'Payment status (sent, confirmed, cancelled)';

COMMENT ON FUNCTION get_brand_commission_total(TEXT, DATE, DATE) IS 'Calculates total commission earned for a brand in a given period';
COMMENT ON FUNCTION get_brand_payments_total(TEXT) IS 'Calculates total payments made for a brand';
COMMENT ON FUNCTION get_brand_commission_balance(TEXT) IS 'Calculates commission balance (earned - paid) for a brand';
