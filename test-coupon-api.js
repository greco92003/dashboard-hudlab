// Script para testar a API de criação de cupons
require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testCouponAPI() {
  console.log('🧪 Testando API de criação de cupons...\n');

  // 1. Testar criação de cupom diretamente no Supabase com trigger
  const testBrand = `API Test ${Date.now()}`;
  const couponCode = `API${Date.now().toString().slice(-6)}`;
  
  console.log(`🎫 Criando cupom de teste: ${couponCode} para marca: ${testBrand}`);

  const testCoupon = {
    code: couponCode,
    percentage: 15,
    brand: testBrand,
    valid_until: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    max_uses: null,
    created_by_brand: testBrand,
    nuvemshop_status: "pending",
    is_auto_generated: true,
  };

  // 2. Inserir o cupom (deve disparar o trigger)
  const { data: insertedCoupon, error: insertError } = await supabase
    .from("generated_coupons")
    .insert(testCoupon)
    .select("*");

  if (insertError) {
    console.error("❌ Erro ao inserir cupom de teste:", insertError);
    return;
  }

  console.log("✅ Cupom de teste inserido com sucesso");
  console.log(`   ID: ${insertedCoupon[0].id}`);
  console.log(`   Status inicial: ${insertedCoupon[0].nuvemshop_status}`);

  // 3. Aguardar o trigger processar
  console.log("⏳ Aguardando trigger processar...");
  await new Promise(resolve => setTimeout(resolve, 5000));

  // 4. Verificar o status final do cupom
  const { data: finalCoupon, error: fetchError } = await supabase
    .from("generated_coupons")
    .select("*")
    .eq("id", insertedCoupon[0].id)
    .single();

  if (fetchError) {
    console.error("❌ Erro ao buscar cupom final:", fetchError);
  } else {
    console.log("\n📋 Status final do cupom:");
    console.log(`   Código: ${finalCoupon.code}`);
    console.log(`   Status: ${finalCoupon.nuvemshop_status}`);
    console.log(`   NuvemShop ID: ${finalCoupon.nuvemshop_coupon_id || 'N/A'}`);
    console.log(`   Erro: ${finalCoupon.nuvemshop_error || 'N/A'}`);
    
    if (finalCoupon.nuvemshop_status === 'created' && finalCoupon.nuvemshop_coupon_id) {
      console.log("✅ Cupom criado com sucesso no NuvemShop!");
    } else if (finalCoupon.nuvemshop_status === 'error') {
      console.log("❌ Erro ao criar cupom no NuvemShop");
    } else if (finalCoupon.nuvemshop_status === 'pending') {
      console.log("⏳ Cupom ainda está pendente (trigger pode não ter executado)");
    }
  }

  // 5. Limpar dados de teste
  console.log("\n🧹 Limpando dados de teste...");
  await supabase
    .from("generated_coupons")
    .delete()
    .eq("id", insertedCoupon[0].id);

  console.log("✅ Dados de teste removidos");
  console.log("\n🧪 Teste concluído!");
}

// Executar se chamado diretamente
if (require.main === module) {
  testCouponAPI().catch(console.error);
}

module.exports = { testCouponAPI };
