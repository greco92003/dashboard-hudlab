// Script para testar o processamento de cupons pendentes
require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testProcessPending() {
  console.log('🧪 Testando processamento de cupons pendentes...\n');

  try {
    // 1. Criar um cupom pendente manualmente para teste
    console.log('1. Criando cupom pendente para teste...');
    
    const testCoupon = {
      code: `TEST${Date.now().toString().slice(-6)}`,
      percentage: 15,
      brand: "Marca Teste Processamento",
      valid_until: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      max_uses: null,
      created_by_brand: "Marca Teste Processamento",
      nuvemshop_status: "pending",
      is_auto_generated: true,
    };

    const { data: insertedCoupon, error: insertError } = await supabase
      .from("generated_coupons")
      .insert(testCoupon)
      .select("*");

    if (insertError) {
      console.error('❌ Erro ao criar cupom de teste:', insertError);
      return;
    }

    console.log(`✅ Cupom de teste criado: ${insertedCoupon[0].code}`);

    // 2. Simular o processamento que seria feito pelo endpoint
    console.log('\n2. Simulando processamento do cupom...');
    
    const coupon = insertedCoupon[0];
    
    // Buscar produtos da marca (se existirem)
    const { data: brandProducts, error: productsError } = await supabase
      .from("nuvemshop_products")
      .select("product_id")
      .eq("brand", coupon.brand)
      .eq("published", true)
      .eq("sync_status", "synced");

    const productIds = brandProducts
      ? brandProducts
          .map((p) => parseInt(p.product_id))
          .filter((id) => !isNaN(id))
      : [];

    console.log(`📦 Produtos encontrados para marca "${coupon.brand}": ${productIds.length}`);

    // Preparar payload do cupom
    const startDate = new Date().toISOString().split("T")[0];
    const endDate = new Date(coupon.valid_until).toISOString().split("T")[0];

    const couponPayload = {
      code: coupon.code,
      type: "percentage",
      value: coupon.percentage.toString(),
      valid: true,
      start_date: startDate,
      end_date: endDate,
      min_price: 0,
      first_consumer_purchase: false,
      combines_with_other_discounts: false,
      includes_shipping: false,
      ...(productIds.length > 0 && { products: productIds }),
    };

    console.log('📋 Payload do cupom:', JSON.stringify(couponPayload, null, 2));

    // 3. Testar criação no NuvemShop
    console.log('\n3. Testando criação no NuvemShop...');
    
    try {
      const accessToken = process.env.NUVEMSHOP_ACCESS_TOKEN;
      const userId = process.env.NUVEMSHOP_USER_ID;
      
      if (!accessToken || !userId) {
        throw new Error("Credenciais do NuvemShop não configuradas");
      }

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
        throw new Error(`Nuvemshop API Error: ${response.status} - ${errorText}`);
      }

      const nuvemshopCoupon = await response.json();
      console.log(`✅ Cupom criado no NuvemShop com sucesso! ID: ${nuvemshopCoupon.id}`);

      // 4. Atualizar status no banco
      console.log('\n4. Atualizando status no banco...');
      
      const { error: updateError } = await supabase
        .from("generated_coupons")
        .update({
          nuvemshop_coupon_id: nuvemshopCoupon.id.toString(),
          nuvemshop_status: "created",
          nuvemshop_error: null,
        })
        .eq("id", coupon.id);

      if (updateError) {
        console.error('❌ Erro ao atualizar status:', updateError);
      } else {
        console.log('✅ Status atualizado com sucesso');
      }

      // 5. Verificar resultado final
      const { data: finalCoupon, error: fetchError } = await supabase
        .from("generated_coupons")
        .select("*")
        .eq("id", coupon.id)
        .single();

      if (fetchError) {
        console.error('❌ Erro ao buscar cupom final:', fetchError);
      } else {
        console.log('\n📋 Status final do cupom:');
        console.log(`   Código: ${finalCoupon.code}`);
        console.log(`   Status: ${finalCoupon.nuvemshop_status}`);
        console.log(`   NuvemShop ID: ${finalCoupon.nuvemshop_coupon_id}`);
        console.log(`   Erro: ${finalCoupon.nuvemshop_error || 'N/A'}`);
      }

    } catch (nuvemshopError) {
      console.error('❌ Erro ao criar cupom no NuvemShop:', nuvemshopError);
      
      // Atualizar status de erro
      await supabase
        .from("generated_coupons")
        .update({
          nuvemshop_status: "error",
          nuvemshop_error: nuvemshopError.message,
        })
        .eq("id", coupon.id);
    }

    // 6. Limpar dados de teste
    console.log('\n🧹 Limpando dados de teste...');
    await supabase
      .from("generated_coupons")
      .delete()
      .eq("id", coupon.id);
    console.log('✅ Dados de teste removidos');

    console.log('\n🎉 Teste concluído!');

  } catch (error) {
    console.error('❌ Erro no teste:', error);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  testProcessPending().catch(console.error);
}

module.exports = { testProcessPending };
