#!/usr/bin/env node

// Script para aplicar a migração dos campos UTM na tabela deals_cache
require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyUTMMigration() {
  console.log('🔧 Aplicando migração dos campos UTM na tabela deals_cache...\n');

  try {
    // Ler o arquivo de migração
    const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', 'add_utm_fields_to_deals_cache.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📄 Conteúdo da migração:');
    console.log(migrationSQL);
    console.log('\n🚀 Executando migração...\n');

    // Executar cada comando SQL separadamente
    const sqlCommands = migrationSQL
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0 && !cmd.startsWith('--'));

    for (const [index, command] of sqlCommands.entries()) {
      if (command.trim()) {
        console.log(`📝 Executando comando ${index + 1}/${sqlCommands.length}...`);
        console.log(`   ${command.substring(0, 50)}...`);
        
        const { error } = await supabase.rpc('exec_sql', {
          sql: command + ';'
        });

        if (error) {
          console.error(`❌ Erro no comando ${index + 1}:`, error);
          throw error;
        } else {
          console.log(`✅ Comando ${index + 1} executado com sucesso`);
        }
      }
    }

    console.log('\n🎉 Migração aplicada com sucesso!');
    
    // Verificar se as colunas foram criadas
    console.log('\n🔍 Verificando se as colunas foram criadas...');
    
    const { data: columns, error: columnsError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type')
      .eq('table_name', 'deals_cache')
      .in('column_name', ['utm-source', 'utm-medium']);

    if (columnsError) {
      console.error('❌ Erro ao verificar colunas:', columnsError);
    } else {
      console.log('✅ Colunas encontradas:');
      columns.forEach(col => {
        console.log(`   - ${col.column_name}: ${col.data_type}`);
      });
    }

    console.log('\n✨ Migração concluída! Os campos UTM Source e UTM Medium foram adicionados à tabela deals_cache.');
    
  } catch (error) {
    console.error('❌ Erro ao aplicar migração:', error);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  applyUTMMigration();
}

module.exports = { applyUTMMigration };
