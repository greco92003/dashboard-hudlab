// Script para testar o trigger de cupons automáticos
require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testAutoCouponTrigger() {
  console.log('🧪 Testando trigger de cupons automáticos...\n');

  // 1. Criar um produto de teste com uma marca nova
  const testBrand = `Marca Teste ${Date.now()}`;
  const testProductId = `999${Date.now()}`;
  
  console.log(`📦 Criando produto de teste: ${testProductId} com marca: ${testBrand}`);

  const testProduct = {
    product_id: testProductId,
    name: "Produto de Teste",
    name_pt: "Produto de Teste",
    brand: testBrand,
    published: true,
    sync_status: "synced",
    last_synced_at: new Date().toISOString(),
  };

  // 2. Inserir o produto
  const { data: insertedProduct, error: insertError } = await supabase
    .from("nuvemshop_products")
    .insert(testProduct)
    .select("*");

  if (insertError) {
    console.error("❌ Erro ao inserir produto de teste:", insertError);
    return;
  }

  console.log("✅ Produto de teste inserido com sucesso");

  // 3. Aguardar um pouco para o trigger processar
  console.log("⏳ Aguardando trigger processar...");
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 4. Verificar se o cupom foi criado automaticamente
  const { data: autoCoupons, error: couponError } = await supabase
    .from("generated_coupons")
    .select("*")
    .eq("brand", testBrand)
    .eq("is_auto_generated", true);

  if (couponError) {
    console.error("❌ Erro ao verificar cupons:", couponError);
  } else {
    console.log(`🎫 Cupons encontrados para marca ${testBrand}:`, autoCoupons.length);
    if (autoCoupons.length > 0) {
      autoCoupons.forEach(coupon => {
        console.log(`   ${coupon.code}: ${coupon.nuvemshop_status} - NuvemShop ID: ${coupon.nuvemshop_coupon_id || 'N/A'}`);
      });
    } else {
      console.log("   ⚠️ Nenhum cupom automático foi criado!");
    }
  }

  // 5. Limpar dados de teste
  console.log("\n🧹 Limpando dados de teste...");
  
  // Remover cupons de teste
  await supabase
    .from("generated_coupons")
    .delete()
    .eq("brand", testBrand);

  // Remover produto de teste
  await supabase
    .from("nuvemshop_products")
    .delete()
    .eq("product_id", testProductId);

  console.log("✅ Dados de teste removidos");

  console.log("\n🧪 Teste concluído!");
}

// Executar se chamado diretamente
if (require.main === module) {
  testAutoCouponTrigger().catch(console.error);
}

module.exports = { testAutoCouponTrigger };
