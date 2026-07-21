import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = (process.env.DASHBOARD_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  console.log('🚀 Aplicando migration: add_seller_target_percentage...');

  try {
    // Executar o SQL da migration
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: `
        -- Adicionar coluna target_percentage na tabela ote_sellers
        ALTER TABLE ote_sellers
        ADD COLUMN IF NOT EXISTS target_percentage DECIMAL(5,2) DEFAULT 0 NOT NULL;

        -- Adicionar comentário na coluna
        COMMENT ON COLUMN ote_sellers.target_percentage IS 'Porcentagem da meta mensal da empresa que é meta deste vendedor (ex: 70.00 = 70%)';

        -- Criar índice para otimizar consultas
        CREATE INDEX IF NOT EXISTS idx_ote_sellers_target_percentage 
        ON ote_sellers(target_percentage) 
        WHERE active = true;
      `
    });

    if (error) {
      // Se a função exec_sql não existir, vamos tentar executar diretamente
      console.log('⚠️  Função exec_sql não encontrada, tentando executar SQL diretamente...');
      
      // Adicionar coluna
      const { error: error1 } = await supabase.from('ote_sellers').select('target_percentage').limit(1);
      
      if (error1 && error1.message.includes('column "target_percentage" does not exist')) {
        console.log('❌ Não é possível executar ALTER TABLE via API do Supabase.');
        console.log('📝 Por favor, execute o SQL manualmente no Supabase Dashboard:');
        console.log('\n--- SQL PARA EXECUTAR ---');
        console.log(`
ALTER TABLE ote_sellers
ADD COLUMN IF NOT EXISTS target_percentage DECIMAL(5,2) DEFAULT 0 NOT NULL;

COMMENT ON COLUMN ote_sellers.target_percentage IS 'Porcentagem da meta mensal da empresa que é meta deste vendedor (ex: 70.00 = 70%)';

CREATE INDEX IF NOT EXISTS idx_ote_sellers_target_percentage 
ON ote_sellers(target_percentage) 
WHERE active = true;
        `);
        console.log('--- FIM DO SQL ---\n');
        console.log('🔗 Acesse: https://supabase.com/dashboard/project/ubqervuhvwnztxmsodlg/editor');
        return;
      } else {
        console.log('✅ Coluna target_percentage já existe!');
      }
    } else {
      console.log('✅ Migration aplicada com sucesso!');
    }

    // Verificar se a coluna existe
    const { data: sellers, error: checkError } = await supabase
      .from('ote_sellers')
      .select('id, seller_name, target_percentage')
      .limit(1);

    if (checkError) {
      console.error('❌ Erro ao verificar coluna:', checkError);
    } else {
      console.log('✅ Verificação: Coluna target_percentage está disponível!');
      console.log('📊 Exemplo de dados:', sellers);
    }

  } catch (error) {
    console.error('❌ Erro ao aplicar migration:', error);
  }
}

applyMigration();

