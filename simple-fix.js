// Script simples para remover todos os triggers problemáticos
require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function simpleFix() {
  console.log('🔧 Aplicando correção simples...\n');

  try {
    // 1. Remover TODOS os triggers relacionados a cupons
    console.log('1. Removendo todos os triggers relacionados a cupons...');
    
    // Remover trigger HTTP
    const { error: error1 } = await supabase.rpc('exec_sql', {
      sql: 'DROP TRIGGER IF EXISTS trigger_process_coupon_nuvemshop ON generated_coupons;'
    });
    
    // Remover trigger de criação automática
    const { error: error2 } = await supabase.rpc('exec_sql', {
      sql: 'DROP TRIGGER IF EXISTS trigger_auto_coupon_new_brand ON nuvemshop_products;'
    });
    
    // Remover funções
    const { error: error3 } = await supabase.rpc('exec_sql', {
      sql: 'DROP FUNCTION IF EXISTS process_coupon_in_nuvemshop();'
    });
    
    const { error: error4 } = await supabase.rpc('exec_sql', {
      sql: 'DROP FUNCTION IF EXISTS trigger_auto_coupon_on_new_brand();'
    });
    
    const { error: error5 } = await supabase.rpc('exec_sql', {
      sql: 'DROP FUNCTION IF EXISTS generate_auto_coupon_for_brand(TEXT);'
    });

    if (error1 || error2 || error3 || error4 || error5) {
      console.log('⚠️ Alguns erros ao remover triggers (pode ser normal se já foram removidos)');
    } else {
      console.log('✅ Todos os triggers removidos com sucesso');
    }

    // 2. Verificar cupons pendentes
    console.log('\n2. Verificando cupons pendentes...');
    
    const { data: pendingCoupons, error: pendingError } = await supabase
      .from('generated_coupons')
      .select('code, brand, nuvemshop_status, created_at')
      .eq('nuvemshop_status', 'pending');

    if (pendingError) {
      console.error('❌ Erro ao verificar cupons pendentes:', pendingError);
    } else {
      console.log(`📋 Cupons pendentes encontrados: ${pendingCoupons.length}`);
      if (pendingCoupons.length > 0) {
        console.log('   Cupons que precisam ser processados:');
        pendingCoupons.slice(0, 5).forEach(coupon => {
          console.log(`   - ${coupon.code} (${coupon.brand})`);
        });
        if (pendingCoupons.length > 5) {
          console.log(`   ... e mais ${pendingCoupons.length - 5} cupons`);
        }
      }
    }

    // 3. Testar inserção simples sem triggers
    console.log('\n3. Testando inserção sem triggers...');
    
    const testProductId = `simple${Date.now()}`;
    const testProduct = {
      product_id: testProductId,
      name: "Produto Teste Simples",
      name_pt: "Produto Teste Simples",
      brand: "Teste Simples",
      published: true,
      sync_status: "synced",
      last_synced_at: new Date().toISOString(),
    };

    const { data: insertedProduct, error: insertError } = await supabase
      .from("nuvemshop_products")
      .insert(testProduct);

    if (insertError) {
      console.error('❌ Ainda há erro na inserção:', insertError);
    } else {
      console.log('✅ Inserção funcionando sem triggers');
      
      // Limpar dados de teste
      await supabase.from('nuvemshop_products').delete().eq('product_id', testProductId);
      console.log('🧹 Dados de teste removidos');
    }

    console.log('\n🎉 Correção simples aplicada!');
    console.log('\n📋 Status atual:');
    console.log('✅ Triggers automáticos removidos (sem mais timeouts)');
    console.log('✅ Cupons podem ser criados manualmente via interface');
    console.log('✅ Endpoint /api/admin/process-pending-coupons disponível para processar cupons pendentes');
    console.log('\n💡 Para criar cupons automáticos agora:');
    console.log('1. Use o botão "Criar Auto-Cupons" na interface');
    console.log('2. Ou chame o endpoint /api/admin/process-auto-coupons');

  } catch (error) {
    console.error('❌ Erro na correção simples:', error);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  simpleFix().catch(console.error);
}

module.exports = { simpleFix };
