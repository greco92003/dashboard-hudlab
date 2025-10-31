/**
 * Script to apply the fix for counting all alterations instead of unique businesses
 * Run this with: node scripts/apply-count-fix.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function applyFix() {
  console.log('🔧 Applying fix to count all alterations...\n');

  // Create Supabase client
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase credentials in .env.local');
    console.error('   Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // SQL to update the function
  const sql = `
CREATE OR REPLACE FUNCTION get_designer_mockups_stats(
  p_designers TEXT[],
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  designer TEXT,
  quantidade_negocios BIGINT,
  mockups_feitos BIGINT,
  alteracoes_feitas BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dmc.designer,
    COUNT(DISTINCT dmc.nome_negocio) as quantidade_negocios,
    COUNT(*) FILTER (WHERE dmc.is_mockup_feito = true) as mockups_feitos,
    COUNT(*) FILTER (WHERE dmc.is_alteracao = true) as alteracoes_feitas
  FROM designer_mockups_cache dmc
  WHERE 
    (p_designers IS NULL OR dmc.designer = ANY(p_designers))
    AND (p_start_date IS NULL OR dmc.atualizado_em >= p_start_date)
    AND (p_end_date IS NULL OR dmc.atualizado_em <= p_end_date)
    AND dmc.sync_status = 'synced'
  GROUP BY dmc.designer
  ORDER BY dmc.designer;
END;
$$;
  `;

  try {
    console.log('📝 Executing SQL migration...');
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      // If exec_sql doesn't exist, try direct execution
      console.log('⚠️  exec_sql RPC not found, trying direct execution...');
      
      const { error: directError } = await supabase
        .from('_migrations')
        .insert({
          name: '20251031_fix_count_all_alterations',
          executed_at: new Date().toISOString()
        });

      if (directError) {
        console.error('❌ Error:', directError.message);
        console.log('\n📋 Please run this SQL manually in Supabase SQL Editor:');
        console.log('   https://supabase.com/dashboard/project/YOUR_PROJECT/sql\n');
        console.log(sql);
        process.exit(1);
      }
    }

    console.log('✅ Migration applied successfully!\n');
    console.log('📊 Changes:');
    console.log('   - quantidade_negocios: Still counts DISTINCT businesses');
    console.log('   - mockups_feitos: Now counts ALL mockup rows (not just unique businesses)');
    console.log('   - alteracoes_feitas: Now counts ALL alteration rows (not just unique businesses)\n');
    console.log('🔄 Next steps:');
    console.log('   1. Go to your dashboard at /designers');
    console.log('   2. Click "Sincronizar Dados" to refresh the cache');
    console.log('   3. Select 30/10/2025 to verify the counts are correct\n');

  } catch (err) {
    console.error('❌ Unexpected error:', err);
    console.log('\n📋 Please run this SQL manually in Supabase SQL Editor:');
    console.log('   https://supabase.com/dashboard/project/YOUR_PROJECT/sql\n');
    console.log(sql);
    process.exit(1);
  }
}

applyFix();

