-- =====================================================
-- NUVEMSHOP INTEGRATION - SUPABASE SETUP
-- =====================================================
-- This script creates tables to store Nuvemshop data
-- Execute this in Supabase SQL Editor
-- =====================================================

-- Create function to update updated_at column (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- =====================================================
-- NUVEMSHOP ORDERS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS nuvemshop_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Order identification
  order_id TEXT NOT NULL UNIQUE, -- Nuvemshop order ID
  order_number TEXT, -- Human readable order number
  
  -- Order dates
  completed_at TIMESTAMP WITH TIME ZONE, -- Data da Venda
  created_at_nuvemshop TIMESTAMP WITH TIME ZONE, -- Original creation date from API
  
  -- Customer information
  contact_name TEXT, -- Cliente
  shipping_address JSONB, -- Full shipping address object
  province TEXT, -- Extracted province from shipping address
  
  -- Products in order
  products JSONB, -- Array of products with name, price, quantity
  
  -- Order totals
  subtotal DECIMAL(10,2), -- Subtotal before discounts
  shipping_cost_customer DECIMAL(10,2), -- Shipping cost charged to customer
  coupon TEXT, -- Coupon code used
  promotional_discount DECIMAL(10,2), -- Promotional discount amount
  total_discount_amount DECIMAL(10,2), -- Total discount amount
  discount_coupon DECIMAL(10,2), -- Discount from coupon
  discount_gateway DECIMAL(10,2), -- Gateway discount
  total DECIMAL(10,2), -- Final total
  
  -- Payment information
  payment_details JSONB, -- Payment method and details
  payment_method TEXT, -- Extracted payment method
  
  -- Order status
  status TEXT, -- Order status (open, closed, cancelled, etc.)
  fulfillment_status TEXT, -- Fulfillment status
  
  -- Sync metadata
  last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  api_updated_at TIMESTAMP WITH TIME ZONE, -- Last update from Nuvemshop API
  sync_status TEXT DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending', 'error', 'deleted')),
  sync_error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_nuvemshop_orders_order_id ON nuvemshop_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_orders_completed_at ON nuvemshop_orders(completed_at) WHERE completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nuvemshop_orders_status ON nuvemshop_orders(status);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_orders_sync_status ON nuvemshop_orders(sync_status);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_orders_last_synced ON nuvemshop_orders(last_synced_at);

-- Create trigger to automatically update the updated_at column
CREATE TRIGGER update_nuvemshop_orders_updated_at
    BEFORE UPDATE ON nuvemshop_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE nuvemshop_orders ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all operations for authenticated users
CREATE POLICY "Allow all operations on nuvemshop_orders for authenticated users" ON nuvemshop_orders
FOR ALL USING (auth.role() = 'authenticated');

-- =====================================================
-- NUVEMSHOP PRODUCTS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS nuvemshop_products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Product identification
  product_id TEXT NOT NULL UNIQUE, -- Nuvemshop product ID (hidden in API)
  
  -- Product basic info
  name JSONB, -- Product name with language variants (pt, en, etc.)
  name_pt TEXT, -- Extracted Portuguese name for easy querying
  
  -- Product details
  brand TEXT, -- Product brand
  description TEXT, -- Product description
  handle TEXT, -- URL handle/slug
  
  -- Product variants
  variants JSONB, -- Array of variants with prices, SKUs, etc.
  
  -- Product images
  images JSONB, -- Array of image objects with id, src, alt, etc.
  featured_image_id TEXT, -- ID of the main/featured image
  featured_image_src TEXT, -- Direct URL to featured image
  
  -- Product status and visibility
  published BOOLEAN DEFAULT false, -- Is product published
  free_shipping BOOLEAN DEFAULT false, -- Has free shipping
  
  -- SEO and metadata
  seo_title TEXT, -- SEO title
  seo_description TEXT, -- SEO description
  tags TEXT[], -- Product tags array
  
  -- Sync metadata
  last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  api_updated_at TIMESTAMP WITH TIME ZONE, -- Last update from Nuvemshop API
  sync_status TEXT DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending', 'error', 'deleted')),
  sync_error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_nuvemshop_products_product_id ON nuvemshop_products(product_id);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_products_name_pt ON nuvemshop_products(name_pt);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_products_brand ON nuvemshop_products(brand) WHERE brand IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nuvemshop_products_published ON nuvemshop_products(published);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_products_sync_status ON nuvemshop_products(sync_status);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_products_last_synced ON nuvemshop_products(last_synced_at);

-- Create GIN indexes for JSONB columns for better search performance
CREATE INDEX IF NOT EXISTS idx_nuvemshop_products_name_gin ON nuvemshop_products USING GIN (name);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_products_variants_gin ON nuvemshop_products USING GIN (variants);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_products_images_gin ON nuvemshop_products USING GIN (images);

-- Create trigger to automatically update the updated_at column
CREATE TRIGGER update_nuvemshop_products_updated_at
    BEFORE UPDATE ON nuvemshop_products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE nuvemshop_products ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all operations for authenticated users
CREATE POLICY "Allow all operations on nuvemshop_products for authenticated users" ON nuvemshop_products
FOR ALL USING (auth.role() = 'authenticated');

-- =====================================================
-- NUVEMSHOP SYNC LOG TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS nuvemshop_sync_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Sync details
  sync_type TEXT NOT NULL CHECK (sync_type IN ('orders', 'products', 'full')),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  
  -- Sync statistics
  total_records INTEGER DEFAULT 0,
  processed_records INTEGER DEFAULT 0,
  new_records INTEGER DEFAULT 0,
  updated_records INTEGER DEFAULT 0,
  error_records INTEGER DEFAULT 0,
  
  -- Timing
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  
  -- Error handling
  error_message TEXT,
  error_details JSONB,
  
  -- Metadata
  triggered_by TEXT, -- 'manual', 'cron', 'api'
  api_rate_limit_remaining INTEGER,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for sync log
CREATE INDEX IF NOT EXISTS idx_nuvemshop_sync_log_sync_type ON nuvemshop_sync_log(sync_type);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_sync_log_status ON nuvemshop_sync_log(status);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_sync_log_started_at ON nuvemshop_sync_log(started_at);

-- Enable Row Level Security (RLS)
ALTER TABLE nuvemshop_sync_log ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all operations for authenticated users
CREATE POLICY "Allow all operations on nuvemshop_sync_log for authenticated users" ON nuvemshop_sync_log
FOR ALL USING (auth.role() = 'authenticated');

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to get the last sync status for a specific type
CREATE OR REPLACE FUNCTION get_last_nuvemshop_sync_status(sync_type_param TEXT DEFAULT 'orders')
RETURNS TABLE (
  status TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  total_records INTEGER,
  processed_records INTEGER,
  error_message TEXT
) 
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    nsl.status,
    nsl.started_at,
    nsl.completed_at,
    nsl.total_records,
    nsl.processed_records,
    nsl.error_message
  FROM nuvemshop_sync_log nsl
  WHERE nsl.sync_type = sync_type_param
  ORDER BY nsl.started_at DESC
  LIMIT 1;
END;
$$;

-- Function to get orders by period (similar to deals function)
CREATE OR REPLACE FUNCTION get_nuvemshop_orders_by_period(
  start_date DATE,
  end_date DATE
)
RETURNS TABLE (
  id UUID,
  order_id TEXT,
  order_number TEXT,
  completed_at TIMESTAMP WITH TIME ZONE,
  contact_name TEXT,
  province TEXT,
  products JSONB,
  subtotal DECIMAL(10,2),
  total DECIMAL(10,2),
  payment_method TEXT,
  status TEXT
)
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    no.id,
    no.order_id,
    no.order_number,
    no.completed_at,
    no.contact_name,
    no.province,
    no.products,
    no.subtotal,
    no.total,
    no.payment_method,
    no.status
  FROM nuvemshop_orders no
  WHERE no.completed_at IS NOT NULL
    AND DATE(no.completed_at) >= start_date
    AND DATE(no.completed_at) <= end_date
    AND no.sync_status = 'synced'
  ORDER BY no.completed_at DESC;
END;
$$;

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE nuvemshop_orders IS 'Stores order data from Nuvemshop API';
COMMENT ON TABLE nuvemshop_products IS 'Stores product data from Nuvemshop API';
COMMENT ON TABLE nuvemshop_sync_log IS 'Logs synchronization operations with Nuvemshop API';

COMMENT ON COLUMN nuvemshop_orders.order_id IS 'Unique order ID from Nuvemshop API';
COMMENT ON COLUMN nuvemshop_orders.products IS 'JSONB array containing product details: name, price, quantity';
COMMENT ON COLUMN nuvemshop_orders.shipping_address IS 'JSONB object with full shipping address details';

COMMENT ON COLUMN nuvemshop_products.product_id IS 'Unique product ID from Nuvemshop API (hidden field)';
COMMENT ON COLUMN nuvemshop_products.name IS 'JSONB object with product name in different languages';
COMMENT ON COLUMN nuvemshop_products.variants IS 'JSONB array with product variants including prices';
COMMENT ON COLUMN nuvemshop_products.images IS 'JSONB array with product images data';
