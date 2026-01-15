import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testOTEJanuary() {
  console.log("🔍 Testando OTE para Janeiro/2026\n");

  // 1. Verificar se existe meta para janeiro/2026
  console.log("1️⃣ Verificando meta de janeiro/2026...");
  const { data: target, error: targetError } = await supabase
    .from("ote_monthly_targets")
    .select("*")
    .eq("month", 1)
    .eq("year", 2026)
    .single();

  if (targetError) {
    console.log("❌ Erro ao buscar meta:", targetError.message);
  } else if (!target) {
    console.log("⚠️  Nenhuma meta encontrada para janeiro/2026");
  } else {
    console.log("✅ Meta encontrada:", {
      id: target.id,
      target_amount: target.target_amount,
      month: target.month,
      year: target.year,
    });
  }

  // 2. Verificar vendedores cadastrados
  console.log("\n2️⃣ Verificando vendedores cadastrados...");
  const { data: sellers, error: sellersError } = await supabase
    .from("ote_sellers")
    .select("*")
    .eq("active", true);

  if (sellersError) {
    console.log("❌ Erro ao buscar vendedores:", sellersError.message);
  } else {
    console.log(`✅ ${sellers?.length || 0} vendedor(es) encontrado(s):`);
    sellers?.forEach((s) => {
      console.log(`   - ${s.seller_name} (ID: ${s.id})`);
    });
  }

  // 3. Verificar deals de janeiro/2026
  console.log("\n3️⃣ Verificando deals de janeiro/2026...");
  const startDate = "2026-01-01";
  const endDate = "2026-01-31";

  const { data: deals, error: dealsError } = await supabase
    .from("deals_cache")
    .select("deal_id, title, value, vendedor, closing_date, custom_field_value, status")
    .eq("status", "won")
    .or(
      `and(closing_date.gte.${startDate},closing_date.lte.${endDate}),and(custom_field_value.gte.${startDate},custom_field_value.lte.${endDate})`
    );

  if (dealsError) {
    console.log("❌ Erro ao buscar deals:", dealsError.message);
  } else {
    console.log(`✅ ${deals?.length || 0} deal(s) encontrado(s) em janeiro/2026`);
    
    // Calcular total
    const total = deals?.reduce((sum, deal) => sum + (deal.value || 0) / 100, 0) || 0;
    console.log(`💰 Faturamento total: R$ ${total.toFixed(2)}`);

    // Agrupar por vendedor
    const byVendedor: Record<string, { count: number; total: number }> = {};
    deals?.forEach((deal) => {
      const vendedor = deal.vendedor || "Sem vendedor";
      if (!byVendedor[vendedor]) {
        byVendedor[vendedor] = { count: 0, total: 0 };
      }
      byVendedor[vendedor].count++;
      byVendedor[vendedor].total += (deal.value || 0) / 100;
    });

    console.log("\n📊 Por vendedor:");
    Object.entries(byVendedor).forEach(([vendedor, stats]) => {
      console.log(`   ${vendedor}: ${stats.count} deals - R$ ${stats.total.toFixed(2)}`);
    });

    // Mostrar alguns exemplos
    console.log("\n📝 Exemplos de deals:");
    deals?.slice(0, 5).forEach((deal) => {
      console.log(`   - ${deal.title} | R$ ${((deal.value || 0) / 100).toFixed(2)} | ${deal.vendedor || "Sem vendedor"}`);
      console.log(`     closing_date: ${deal.closing_date || "null"} | custom_field_value: ${deal.custom_field_value || "null"}`);
    });
  }

  // 4. Verificar configuração OTE
  console.log("\n4️⃣ Verificando configuração OTE...");
  const { data: config, error: configError } = await supabase
    .from("ote_config")
    .select("*")
    .eq("active", true)
    .single();

  if (configError) {
    console.log("❌ Erro ao buscar configuração:", configError.message);
  } else if (!config) {
    console.log("⚠️  Nenhuma configuração ativa encontrada");
  } else {
    console.log("✅ Configuração encontrada:", {
      paid_traffic_percentage: config.paid_traffic_percentage,
      organic_percentage: config.organic_percentage,
      multipliers: config.multipliers,
    });
  }
}

testOTEJanuary()
  .then(() => {
    console.log("\n✅ Teste concluído");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Erro no teste:", error);
    process.exit(1);
  });

