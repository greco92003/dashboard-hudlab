// Script para verificar erros na criação de cupons
require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  (process.env.DASHBOARD_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
);

async function checkCouponErrors() {
  console.log('🔍 Verificando erros na criação de cupons...\n');

  // 1. Verificar cupons com erro
  const { data: errorCoupons, error: fetchError } = await supabase
    .from("generated_coupons")
    .select("*")
    .eq("nuvemshop_status", "error")
    .order("created_at", { ascending: false })
    .limit(10);

  if (fetchError) {
    console.error("❌ Erro ao buscar cupons:", fetchError);
    return;
  }

  console.log(`🎫 Cupons com erro encontrados: ${errorCoupons.length}`);
  
  if (errorCoupons.length > 0) {
    errorCoupons.forEach(coupon => {
      console.log(`\n📋 Cupom: ${coupon.code}`);
      console.log(`   Marca: ${coupon.brand}`);
      console.log(`   Status: ${coupon.nuvemshop_status}`);
      console.log(`   Erro: ${coupon.nuvemshop_error || 'N/A'}`);
      console.log(`   Criado em: ${coupon.created_at}`);
      console.log(`   Auto-gerado: ${coupon.is_auto_generated}`);
    });
  }

  // 2. Verificar cupons pendentes
  const { data: pendingCoupons, error: pendingError } = await supabase
    .from("generated_coupons")
    .select("*")
    .eq("nuvemshop_status", "pending")
    .order("created_at", { ascending: false })
    .limit(5);

  if (pendingError) {
    console.error("❌ Erro ao buscar cupons pendentes:", pendingError);
  } else {
    console.log(`\n⏳ Cupons pendentes encontrados: ${pendingCoupons.length}`);
    
    if (pendingCoupons.length > 0) {
      pendingCoupons.forEach(coupon => {
        console.log(`   ${coupon.code} (${coupon.brand}) - Criado: ${coupon.created_at}`);
      });
    }
  }

  // 3. Testar criação manual de cupom via API
  console.log('\n🧪 Testando criação manual de cupom...');
  
  try {
    const testResponse = await fetch('/api/partners/coupons/auto-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brand: 'Teste Manual' })
    });
    
    if (testResponse.ok) {
      const result = await testResponse.json();
      console.log('✅ Teste manual bem-sucedido:', result);
    } else {
      const error = await testResponse.text();
      console.log('❌ Teste manual falhou:', error);
    }
  } catch (error) {
    console.log('❌ Erro no teste manual:', error.message);
  }

  console.log('\n🔍 Verificação concluída!');
}

// Executar se chamado diretamente
if (require.main === module) {
  checkCouponErrors().catch(console.error);
}

module.exports = { checkCouponErrors };
