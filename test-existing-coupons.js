// Script para testar processamento de cupons existentes
require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testExistingCoupons() {
  console.log('🧪 Testando cupons existentes...\n');

  try {
    // 1. Verificar cupons existentes
    console.log('1. Verificando cupons existentes...');
    
    const { data: allCoupons, error: fetchError } = await supabase
      .from("generated_coupons")
      .select("code, brand, nuvemshop_status, nuvemshop_coupon_id, is_auto_generated")
      .order("created_at", { ascending: false })
      .limit(10);

    if (fetchError) {
      console.error('❌ Erro ao buscar cupons:', fetchError);
      return;
    }

    console.log(`📋 Cupons encontrados: ${allCoupons.length}`);
    allCoupons.forEach(coupon => {
      const status = coupon.nuvemshop_coupon_id ? '✅ Criado' : '❌ Não criado';
      console.log(`   ${coupon.code} (${coupon.brand}): ${coupon.nuvemshop_status} ${status}`);
    });

    // 2. Verificar se há cupons que precisam ser criados no NuvemShop
    const couponsNeedingCreation = allCoupons.filter(c => 
      !c.nuvemshop_coupon_id && c.nuvemshop_status !== 'error'
    );

    console.log(`\n📦 Cupons que precisam ser criados no NuvemShop: ${couponsNeedingCreation.length}`);

    if (couponsNeedingCreation.length > 0) {
      // 3. Testar criação de um cupom no NuvemShop
      const testCoupon = couponsNeedingCreation[0];
      console.log(`\n3. Testando criação do cupom: ${testCoupon.code}`);

      try {
        const accessToken = process.env.NUVEMSHOP_ACCESS_TOKEN;
        const userId = process.env.NUVEMSHOP_USER_ID;
        
        if (!accessToken || !userId) {
          throw new Error("Credenciais do NuvemShop não configuradas");
        }

        // Buscar produtos da marca
        const { data: brandProducts, error: productsError } = await supabase
          .from("nuvemshop_products")
          .select("product_id")
          .eq("brand", testCoupon.brand)
          .eq("published", true)
          .eq("sync_status", "synced");

        const productIds = brandProducts
          ? brandProducts
              .map((p) => parseInt(p.product_id))
              .filter((id) => !isNaN(id))
          : [];

        console.log(`📦 Produtos da marca "${testCoupon.brand}": ${productIds.length}`);

        // Preparar payload
        const couponPayload = {
          code: testCoupon.code,
          type: "percentage",
          value: "15",
          valid: true,
          start_date: new Date().toISOString().split("T")[0],
          end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          min_price: 0,
          first_consumer_purchase: false,
          combines_with_other_discounts: false,
          includes_shipping: false,
          ...(productIds.length > 0 && { products: productIds }),
        };

        console.log('📋 Payload:', JSON.stringify(couponPayload, null, 2));

        // Fazer chamada para NuvemShop
        const url = `https://api.nuvemshop.com.br/v1/${userId}/coupons`;
        
        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authentication: `bearer ${accessToken}`,
            "Content-Type": "application/json",
            "User-Agent": "HudLab Dashboard (contato@hudlab.com.br)",
          },
          body: JSON.stringify(couponPayload),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Erro da API NuvemShop: ${response.status} - ${errorText}`);
        } else {
          const nuvemshopCoupon = await response.json();
          console.log(`✅ Cupom criado no NuvemShop! ID: ${nuvemshopCoupon.id}`);
          
          // Nota: Não vamos atualizar o banco aqui para evitar timeout
          console.log('ℹ️ Para atualizar o banco, use a interface web ou endpoint específico');
        }

      } catch (error) {
        console.error('❌ Erro ao testar criação:', error);
      }
    }

    // 4. Verificar status geral do sistema
    console.log('\n4. Status geral do sistema:');
    
    const createdCount = allCoupons.filter(c => c.nuvemshop_coupon_id).length;
    const pendingCount = allCoupons.filter(c => c.nuvemshop_status === 'pending').length;
    const errorCount = allCoupons.filter(c => c.nuvemshop_status === 'error').length;
    
    console.log(`   ✅ Cupons criados no NuvemShop: ${createdCount}`);
    console.log(`   ⏳ Cupons pendentes: ${pendingCount}`);
    console.log(`   ❌ Cupons com erro: ${errorCount}`);

    console.log('\n🎉 Análise concluída!');

  } catch (error) {
    console.error('❌ Erro na análise:', error);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  testExistingCoupons().catch(console.error);
}

module.exports = { testExistingCoupons };
