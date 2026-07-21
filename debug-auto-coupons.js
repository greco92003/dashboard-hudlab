// Script para debugar o sistema de cupons automáticos
require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  (process.env.DASHBOARD_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
);

async function debugAutoCoupons() {
  console.log("🔍 Debugando sistema de cupons automáticos...\n");

  // 1. Verificar credenciais do NuvemShop no banco
  console.log("1. Verificando credenciais do NuvemShop no banco...");
  const { data: credentials, error: credError } = await supabase
    .from("system_config")
    .select("key, value")
    .in("key", ["nuvemshop_access_token", "nuvemshop_user_id"]);

  if (credError) {
    console.error("❌ Erro ao buscar credenciais:", credError);
  } else {
    console.log("📋 Credenciais encontradas:");
    credentials.forEach((cred) => {
      const maskedValue =
        cred.value.length > 10
          ? cred.value.substring(0, 10) + "..."
          : cred.value;
      console.log(`   ${cred.key}: ${maskedValue}`);
    });
  }

  // 2. Verificar se o trigger existe (simplificado)
  console.log("\n2. Verificando triggers ativos...");
  console.log("   ⚠️ Verificação de triggers requer acesso direto ao banco");

  // 3. Verificar produtos recentes com marca
  console.log("\n3. Verificando produtos recentes com marca...");
  const { data: recentProducts, error: productsError } = await supabase
    .from("nuvemshop_products")
    .select(
      "product_id, name_pt, brand, published, sync_status, last_synced_at"
    )
    .not("brand", "is", null)
    .eq("published", true)
    .eq("sync_status", "synced")
    .order("last_synced_at", { ascending: false })
    .limit(5);

  if (productsError) {
    console.error("❌ Erro ao buscar produtos:", productsError);
  } else {
    console.log("📦 Produtos recentes com marca:");
    recentProducts.forEach((product) => {
      console.log(
        `   ${product.product_id}: ${product.name_pt} (${product.brand})`
      );
    });
  }

  // 4. Verificar cupons automáticos gerados
  console.log("\n4. Verificando cupons automáticos gerados...");
  const { data: autoCoupons, error: couponsError } = await supabase
    .from("generated_coupons")
    .select(
      "code, brand, percentage, nuvemshop_status, nuvemshop_coupon_id, created_at, is_auto_generated"
    )
    .eq("is_auto_generated", true)
    .order("created_at", { ascending: false })
    .limit(10);

  if (couponsError) {
    console.error("❌ Erro ao buscar cupons:", couponsError);
  } else {
    console.log("🎫 Cupons automáticos encontrados:");
    if (autoCoupons && autoCoupons.length > 0) {
      autoCoupons.forEach((coupon) => {
        console.log(
          `   ${coupon.code} (${coupon.brand}): ${
            coupon.nuvemshop_status
          } - NuvemShop ID: ${coupon.nuvemshop_coupon_id || "N/A"}`
        );
      });
    } else {
      console.log("   ⚠️ Nenhum cupom automático encontrado!");
    }
  }

  // 5. Verificar logs de webhook recentes
  console.log("\n5. Verificando logs de webhook recentes...");
  const { data: webhookLogs, error: logsError } = await supabase
    .from("nuvemshop_webhook_logs")
    .select("event, resource_id, status, error_message, received_at")
    .eq("event", "product/created")
    .order("received_at", { ascending: false })
    .limit(5);

  if (logsError) {
    console.error("❌ Erro ao buscar logs:", logsError);
  } else {
    console.log("📨 Logs de webhook product/created recentes:");
    if (webhookLogs && webhookLogs.length > 0) {
      webhookLogs.forEach((log) => {
        console.log(
          `   ${log.resource_id}: ${log.status} - ${log.error_message || "OK"}`
        );
      });
    } else {
      console.log("   ⚠️ Nenhum log de webhook encontrado!");
    }
  }

  // 6. Verificar marcas que precisam de cupons (simplificado)
  console.log("\n6. Verificando marcas que precisam de cupons...");

  // Buscar todas as marcas distintas
  const { data: allBrands, error: brandsError } = await supabase
    .from("nuvemshop_products")
    .select("brand")
    .not("brand", "is", null)
    .neq("brand", "")
    .eq("published", true)
    .eq("sync_status", "synced");

  // Buscar marcas que já têm cupons automáticos
  const { data: brandsWithCoupons, error: couponsCheckError } = await supabase
    .from("generated_coupons")
    .select("brand")
    .eq("is_auto_generated", true);

  if (brandsError || couponsCheckError) {
    console.error(
      "❌ Erro ao verificar marcas:",
      brandsError || couponsCheckError
    );
  } else {
    const uniqueBrands = [...new Set(allBrands.map((p) => p.brand))];
    const brandsWithAutoCoupons = new Set(
      brandsWithCoupons.map((c) => c.brand)
    );
    const brandsNeedingCoupons = uniqueBrands.filter(
      (brand) => !brandsWithAutoCoupons.has(brand)
    );

    console.log("🏷️ Marcas que precisam de cupons automáticos:");
    if (brandsNeedingCoupons.length > 0) {
      brandsNeedingCoupons.forEach((brand) => {
        console.log(`   ${brand}`);
      });
    } else {
      console.log("   ✅ Todas as marcas já possuem cupons automáticos!");
    }
  }

  console.log("\n🔍 Debug concluído!");
}

// Executar se chamado diretamente
if (require.main === module) {
  debugAutoCoupons().catch(console.error);
}

module.exports = { debugAutoCoupons };
