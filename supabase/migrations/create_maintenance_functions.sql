-- Create maintenance functions for NuvemShop sync

-- Function to count potential duplicate products
CREATE OR REPLACE FUNCTION count_potential_duplicates()
RETURNS INTEGER AS $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO duplicate_count
  FROM (
    SELECT LOWER(TRIM(name_pt)) as normalized_name
    FROM nuvemshop_products
    WHERE name_pt IS NOT NULL 
      AND name_pt != ''
      AND sync_status != 'deleted'
    GROUP BY LOWER(TRIM(name_pt))
    HAVING COUNT(*) > 1
  ) duplicates;
  
  RETURN duplicate_count;
END;
$$ LANGUAGE plpgsql;

-- Function to find duplicate products with details
CREATE OR REPLACE FUNCTION find_duplicate_products()
RETURNS TABLE (
  normalized_name TEXT,
  product_count INTEGER,
  products JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    LOWER(TRIM(p.name_pt)) as normalized_name,
    COUNT(*)::INTEGER as product_count,
    JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'product_id', p.product_id,
        'name_pt', p.name_pt,
        'brand', p.brand,
        'sync_status', p.sync_status,
        'created_at', p.created_at,
        'last_synced_at', p.last_synced_at
      ) ORDER BY 
        CASE WHEN p.sync_status = 'deleted' THEN 1 ELSE 0 END,
        p.last_synced_at DESC NULLS LAST,
        p.created_at DESC
    ) as products
  FROM nuvemshop_products p
  WHERE p.name_pt IS NOT NULL AND p.name_pt != ''
  GROUP BY LOWER(TRIM(p.name_pt))
  HAVING COUNT(*) > 1
  ORDER BY COUNT(*) DESC, LOWER(TRIM(p.name_pt));
END;
$$ LANGUAGE plpgsql;

-- Function to get maintenance statistics
CREATE OR REPLACE FUNCTION get_maintenance_stats()
RETURNS JSONB AS $$
DECLARE
  stats JSONB;
BEGIN
  SELECT JSONB_BUILD_OBJECT(
    'products', JSONB_BUILD_OBJECT(
      'total', (SELECT COUNT(*) FROM nuvemshop_products),
      'active', (SELECT COUNT(*) FROM nuvemshop_products WHERE sync_status != 'deleted'),
      'deleted', (SELECT COUNT(*) FROM nuvemshop_products WHERE sync_status = 'deleted'),
      'synced', (SELECT COUNT(*) FROM nuvemshop_products WHERE sync_status = 'synced'),
      'pending', (SELECT COUNT(*) FROM nuvemshop_products WHERE sync_status = 'pending'),
      'error', (SELECT COUNT(*) FROM nuvemshop_products WHERE sync_status = 'error')
    ),
    'coupons', JSONB_BUILD_OBJECT(
      'total', (SELECT COUNT(*) FROM generated_coupons),
      'active', (SELECT COUNT(*) FROM generated_coupons WHERE is_active = true AND nuvemshop_status != 'deleted'),
      'deleted', (SELECT COUNT(*) FROM generated_coupons WHERE nuvemshop_status = 'deleted'),
      'created', (SELECT COUNT(*) FROM generated_coupons WHERE nuvemshop_status = 'created'),
      'pending', (SELECT COUNT(*) FROM generated_coupons WHERE nuvemshop_status = 'pending'),
      'error', (SELECT COUNT(*) FROM generated_coupons WHERE nuvemshop_status = 'error')
    ),
    'duplicates', JSONB_BUILD_OBJECT(
      'potential_duplicate_groups', count_potential_duplicates()
    ),
    'last_sync', JSONB_BUILD_OBJECT(
      'products', (
        SELECT completed_at 
        FROM nuvemshop_sync_log 
        WHERE sync_type = 'products' AND status = 'completed'
        ORDER BY completed_at DESC 
        LIMIT 1
      ),
      'coupons', (
        SELECT completed_at 
        FROM nuvemshop_sync_log 
        WHERE sync_type LIKE '%coupon%' AND status = 'completed'
        ORDER BY completed_at DESC 
        LIMIT 1
      ),
      'cleanup', (
        SELECT completed_at 
        FROM nuvemshop_sync_log 
        WHERE sync_type LIKE 'cleanup%' AND status IN ('completed', 'completed_with_errors')
        ORDER BY completed_at DESC 
        LIMIT 1
      ),
      'deduplication', (
        SELECT completed_at 
        FROM nuvemshop_sync_log 
        WHERE sync_type LIKE 'deduplicate%' AND status IN ('completed', 'completed_with_errors')
        ORDER BY completed_at DESC 
        LIMIT 1
      )
    )
  ) INTO stats;
  
  RETURN stats;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old sync logs (keep last 100 entries)
CREATE OR REPLACE FUNCTION cleanup_old_sync_logs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH logs_to_keep AS (
    SELECT id
    FROM nuvemshop_sync_log
    ORDER BY started_at DESC
    LIMIT 100
  )
  DELETE FROM nuvemshop_sync_log
  WHERE id NOT IN (SELECT id FROM logs_to_keep);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Add comments
COMMENT ON FUNCTION count_potential_duplicates() IS 
'Returns the number of product groups that have duplicate names (case-insensitive)';

COMMENT ON FUNCTION find_duplicate_products() IS 
'Returns detailed information about products with duplicate names, ordered by priority for keeping';

COMMENT ON FUNCTION get_maintenance_stats() IS 
'Returns comprehensive statistics about products, coupons, and sync status for maintenance dashboard';

COMMENT ON FUNCTION cleanup_old_sync_logs() IS 
'Removes old sync log entries, keeping only the most recent 100 records';

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION count_potential_duplicates() TO authenticated;
GRANT EXECUTE ON FUNCTION find_duplicate_products() TO authenticated;
GRANT EXECUTE ON FUNCTION get_maintenance_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_sync_logs() TO authenticated;
