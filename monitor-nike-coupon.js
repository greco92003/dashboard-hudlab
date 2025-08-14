// Script para monitorar criação de cupom para marca Nike
require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function monitorNikeCoupon() {
  console.log('👀 Monitorando criação de cupom para marca Nike...\n');

  // Estado inicial
  let initialCoupons = [];
  let initialProducts = [];

  try {
    // 1. Capturar estado inicial dos cupons
    const { data: currentCoupons, error: couponsError } = await supabase
      .from("generated_coupons")
      .select("*")
      .ilike("brand", "%nike%");

    if (couponsError) {
      console.error('❌ Erro ao buscar cupons iniciais:', couponsError);
    } else {
      initialCoupons = currentCoupons || [];
      console.log(`📋 Cupons Nike existentes: ${initialCoupons.length}`);
      initialCoupons.forEach(coupon => {
        console.log(`   ${coupon.code} (${coupon.brand}): ${coupon.nuvemshop_status}`);
      });
    }

    // 2. Capturar estado inicial dos produtos
    const { data: currentProducts, error: productsError } = await supabase
      .from("nuvemshop_products")
      .select("*")
      .ilike("brand", "%nike%");

    if (productsError) {
      console.error('❌ Erro ao buscar produtos iniciais:', productsError);
    } else {
      initialProducts = currentProducts || [];
      console.log(`📦 Produtos Nike existentes: ${initialProducts.length}`);
      initialProducts.forEach(product => {
        console.log(`   ${product.product_id}: ${product.name_pt} (${product.brand})`);
      });
    }

    console.log('\n🚀 Pronto! Agora você pode criar o produto Nike.');
    console.log('⏳ Monitorando mudanças a cada 5 segundos...\n');

    // 3. Loop de monitoramento
    let checkCount = 0;
    const maxChecks = 60; // 5 minutos de monitoramento

    const monitorInterval = setInterval(async () => {
      checkCount++;
      
      try {
        // Verificar novos produtos Nike
        const { data: newProducts, error: newProductsError } = await supabase
          .from("nuvemshop_products")
          .select("*")
          .ilike("brand", "%nike%");

        if (!newProductsError && newProducts) {
          const addedProducts = newProducts.filter(np => 
            !initialProducts.some(ip => ip.product_id === np.product_id)
          );

          if (addedProducts.length > 0) {
            console.log(`📦 NOVO PRODUTO NIKE DETECTADO!`);
            addedProducts.forEach(product => {
              console.log(`   ${product.product_id}: ${product.name_pt} (${product.brand})`);
              console.log(`   Publicado: ${product.published}, Status: ${product.sync_status}`);
            });
          }
        }

        // Verificar novos cupons Nike
        const { data: newCoupons, error: newCouponsError } = await supabase
          .from("generated_coupons")
          .select("*")
          .ilike("brand", "%nike%");

        if (!newCouponsError && newCoupons) {
          const addedCoupons = newCoupons.filter(nc => 
            !initialCoupons.some(ic => ic.id === nc.id)
          );

          if (addedCoupons.length > 0) {
            console.log(`🎫 NOVO CUPOM NIKE DETECTADO!`);
            addedCoupons.forEach(coupon => {
              console.log(`   ${coupon.code} (${coupon.brand})`);
              console.log(`   Status: ${coupon.nuvemshop_status}`);
              console.log(`   Auto-gerado: ${coupon.is_auto_generated}`);
              console.log(`   NuvemShop ID: ${coupon.nuvemshop_coupon_id || 'N/A'}`);
              console.log(`   Erro: ${coupon.nuvemshop_error || 'N/A'}`);
            });

            // Parar monitoramento se cupom foi criado
            clearInterval(monitorInterval);
            console.log('\n✅ Cupom detectado! Monitoramento finalizado.');
            return;
          }
        }

        // Status do monitoramento
        if (checkCount % 6 === 0) { // A cada 30 segundos
          console.log(`⏳ Monitorando... (${checkCount * 5}s / ${maxChecks * 5}s)`);
        }

        // Parar após tempo limite
        if (checkCount >= maxChecks) {
          clearInterval(monitorInterval);
          console.log('\n⏰ Tempo limite atingido. Monitoramento finalizado.');
          console.log('💡 Se você criou o produto, pode haver delay ou problema no trigger.');
        }

      } catch (error) {
        console.error('❌ Erro no monitoramento:', error);
      }
    }, 5000); // Verificar a cada 5 segundos

  } catch (error) {
    console.error('❌ Erro no setup do monitoramento:', error);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  monitorNikeCoupon().catch(console.error);
}

module.exports = { monitorNikeCoupon };
