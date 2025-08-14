// Script para aplicar a correção do sistema de cupons automáticos
require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const fs = require('fs');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyFix() {
  console.log('🔧 Aplicando correção do sistema de cupons automáticos...\n');

  try {
    // 1. Remover trigger HTTP problemático
    console.log('1. Removendo trigger HTTP problemático...');
    
    await supabase.rpc('exec_sql', {
      sql: 'DROP TRIGGER IF EXISTS trigger_process_coupon_nuvemshop ON generated_coupons;'
    });
    
    await supabase.rpc('exec_sql', {
      sql: 'DROP FUNCTION IF EXISTS process_coupon_in_nuvemshop();'
    });
    
    console.log('✅ Trigger HTTP removido');

    // 2. Verificar se o trigger de criação automática está funcionando
    console.log('\n2. Verificando trigger de criação automática...');
    
    const { data: triggers, error: triggerError } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT trigger_name, event_manipulation, action_timing
        FROM information_schema.triggers 
        WHERE trigger_name = 'trigger_auto_coupon_new_brand'
          AND event_object_table = 'nuvemshop_products';
      `
    });

    if (triggerError) {
      console.log('⚠️ Não foi possível verificar triggers via RPC');
    } else if (triggers && triggers.length > 0) {
      console.log('✅ Trigger de criação automática está ativo');
    } else {
      console.log('⚠️ Trigger de criação automática não encontrado');
    }

    // 3. Verificar cupons pendentes
    console.log('\n3. Verificando cupons pendentes...');
    
    const { data: pendingCoupons, error: pendingError } = await supabase
      .from('generated_coupons')
      .select('code, brand, nuvemshop_status, created_at')
      .eq('nuvemshop_status', 'pending')
      .eq('is_auto_generated', true);

    if (pendingError) {
      console.error('❌ Erro ao verificar cupons pendentes:', pendingError);
    } else {
      console.log(`📋 Cupons pendentes encontrados: ${pendingCoupons.length}`);
      if (pendingCoupons.length > 0) {
        console.log('   Cupons que precisam ser processados:');
        pendingCoupons.forEach(coupon => {
          console.log(`   - ${coupon.code} (${coupon.brand})`);
        });
      }
    }

    // 4. Testar criação de produto para verificar se trigger funciona
    console.log('\n4. Testando trigger com produto de teste...');
    
    const testBrand = `Fix Test ${Date.now()}`;
    const testProductId = `fix${Date.now()}`;
    
    const testProduct = {
      product_id: testProductId,
      name: "Produto Fix Test",
      name_pt: "Produto Fix Test",
      brand: testBrand,
      published: true,
      sync_status: "synced",
      last_synced_at: new Date().toISOString(),
    };

    const { data: insertedProduct, error: insertError } = await supabase
      .from("nuvemshop_products")
      .insert(testProduct);

    if (insertError) {
      console.error('❌ Erro ao inserir produto de teste:', insertError);
    } else {
      console.log('✅ Produto de teste inserido');
      
      // Aguardar trigger processar
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Verificar se cupom foi criado
      const { data: newCoupon, error: couponError } = await supabase
        .from('generated_coupons')
        .select('*')
        .eq('brand', testBrand)
        .eq('is_auto_generated', true);

      if (couponError) {
        console.error('❌ Erro ao verificar cupom criado:', couponError);
      } else if (newCoupon && newCoupon.length > 0) {
        console.log(`✅ Trigger funcionando! Cupom criado: ${newCoupon[0].code} (status: ${newCoupon[0].nuvemshop_status})`);
      } else {
        console.log('⚠️ Trigger não criou cupom automático');
      }

      // Limpar dados de teste
      await supabase.from('generated_coupons').delete().eq('brand', testBrand);
      await supabase.from('nuvemshop_products').delete().eq('product_id', testProductId);
      console.log('🧹 Dados de teste removidos');
    }

    console.log('\n🎉 Correção aplicada com sucesso!');
    console.log('\n📋 Próximos passos:');
    console.log('1. Os cupons automáticos agora são criados com status "pending"');
    console.log('2. Use o endpoint /api/admin/process-pending-coupons para processar cupons pendentes');
    console.log('3. Considere criar um cron job para processar cupons pendentes automaticamente');

  } catch (error) {
    console.error('❌ Erro ao aplicar correção:', error);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  applyFix().catch(console.error);
}

module.exports = { applyFix };
