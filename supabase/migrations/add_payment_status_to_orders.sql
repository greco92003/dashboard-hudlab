-- Add payment_status field to nuvemshop_orders table
-- This field will store the payment status from Nuvemshop API (paid, pending, authorized, etc.)

ALTER TABLE nuvemshop_orders 
ADD COLUMN IF NOT EXISTS payment_status TEXT;

-- Create index for better performance when filtering by payment status
CREATE INDEX IF NOT EXISTS idx_nuvemshop_orders_payment_status ON nuvemshop_orders(payment_status);

-- Add comment for documentation
COMMENT ON COLUMN nuvemshop_orders.payment_status IS 'Payment status from Nuvemshop API (paid, pending, authorized, refunded, etc.)';
