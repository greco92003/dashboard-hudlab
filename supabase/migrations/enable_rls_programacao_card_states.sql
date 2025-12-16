-- Enable Row Level Security for programacao_card_states table
-- This migration fixes the critical security issue where RLS was not enabled
-- on the programacao_card_states table, which is exposed via PostgREST

-- First, ensure the table exists (it should already exist in production)
-- This is a safety check and won't recreate if it exists
CREATE TABLE IF NOT EXISTS programacao_card_states (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id TEXT UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for better query performance on deal_id lookups
CREATE INDEX IF NOT EXISTS idx_programacao_card_states_deal_id 
ON programacao_card_states(deal_id);

-- Create index for filtering active cards
CREATE INDEX IF NOT EXISTS idx_programacao_card_states_is_active 
ON programacao_card_states(is_active) 
WHERE is_active = true;

-- Create trigger function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_programacao_card_states_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

-- Create trigger to automatically update updated_at on row updates
DROP TRIGGER IF EXISTS trigger_update_programacao_card_states_updated_at ON programacao_card_states;
CREATE TRIGGER trigger_update_programacao_card_states_updated_at
  BEFORE UPDATE ON programacao_card_states
  FOR EACH ROW
  EXECUTE FUNCTION update_programacao_card_states_updated_at();

-- Enable Row Level Security
ALTER TABLE programacao_card_states ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "service_role_full_access" ON programacao_card_states;
DROP POLICY IF EXISTS "authenticated_users_full_access" ON programacao_card_states;

-- Policy 1: Allow service role complete access (for API operations and sync)
-- This is needed for backend operations that use the service role key
CREATE POLICY "service_role_full_access" ON programacao_card_states
  FOR ALL 
  TO service_role 
  USING (true) 
  WITH CHECK (true);

-- Policy 2: Allow authenticated users full access to manage card states
-- Users need to be able to read, insert, update card states from the frontend
-- This table stores UI state (which cards are active/visible) per deal
CREATE POLICY "authenticated_users_full_access" ON programacao_card_states
  FOR ALL
  TO authenticated
  USING (
    (SELECT auth.role()) = 'authenticated' OR
    (SELECT auth.jwt() ->> 'role') = 'service_role' OR
    (SELECT current_setting('role', true)) = 'service_role'
  )
  WITH CHECK (
    (SELECT auth.role()) = 'authenticated' OR
    (SELECT auth.jwt() ->> 'role') = 'service_role' OR
    (SELECT current_setting('role', true)) = 'service_role'
  );

-- Add table and column comments for documentation
COMMENT ON TABLE programacao_card_states IS 
'Stores the active/inactive state of cards in the programacao (scheduling) view. This is UI state management.';

COMMENT ON COLUMN programacao_card_states.deal_id IS 
'Reference to the deal ID from ActiveCampaign (stored in programacao_cache)';

COMMENT ON COLUMN programacao_card_states.is_active IS 
'Whether the card is currently active/visible in the UI';

COMMENT ON POLICY "service_role_full_access" ON programacao_card_states IS
'Allows service role complete access for backend operations';

COMMENT ON POLICY "authenticated_users_full_access" ON programacao_card_states IS
'Allows authenticated users to manage card states for the programacao view';

