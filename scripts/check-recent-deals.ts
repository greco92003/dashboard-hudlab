import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkRecentDeals() {
  console.log("🔍 Verificando deals recentes na tabela deals_cache\n");

  // Buscar deals recentes (últimos 30 dias)
  const { data: deals, error } = await supabase
    .from("deals_cache")
    .select("deal_id, title, value, vendedor, closing_date, custom_field_value, created_date, status, sync_status")
    .eq("status", "won")
    .order("created_date", { ascending: false })
    .limit(20);

  if (error) {
    console.log("❌ Erro ao buscar deals:", error.message);
    return;
  }

  console.log(`✅ ${deals?.length || 0} deals recentes encontrados\n`);

  // Calcular total
  const total = deals?.reduce((sum, deal) => sum + (deal.value || 0) / 100, 0) || 0;
  console.log(`💰 Faturamento total dos últimos deals: R$ ${total.toFixed(2)}\n`);

  // Mostrar detalhes
  console.log("📝 Detalhes dos deals:\n");
  deals?.forEach((deal, index) => {
    console.log(`${index + 1}. ${deal.title}`);
    console.log(`   Valor: R$ ${((deal.value || 0) / 100).toFixed(2)}`);
    console.log(`   Vendedor: ${deal.vendedor || "Sem vendedor"}`);
    console.log(`   Status: ${deal.status} | Sync: ${deal.sync_status}`);
    console.log(`   closing_date: ${deal.closing_date || "null"}`);
    console.log(`   custom_field_value: ${deal.custom_field_value || "null"}`);
    console.log(`   created_date: ${deal.created_date || "null"}`);
    console.log("");
  });

  // Verificar deals com valor total próximo a R$ 44.700,94
  console.log("\n🎯 Buscando combinações que somem ~R$ 44.700,94...\n");
  
  // Agrupar por mês/ano baseado em diferentes campos de data
  const byMonth: Record<string, { deals: any[]; total: number }> = {};
  
  deals?.forEach((deal) => {
    // Tentar diferentes campos de data
    const dates = [
      deal.closing_date,
      deal.custom_field_value,
      deal.created_date,
    ].filter(Boolean);

    dates.forEach((dateStr) => {
      if (dateStr) {
        const date = new Date(dateStr);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        
        if (!byMonth[monthKey]) {
          byMonth[monthKey] = { deals: [], total: 0 };
        }
        
        // Evitar duplicatas
        if (!byMonth[monthKey].deals.find((d) => d.deal_id === deal.deal_id)) {
          byMonth[monthKey].deals.push(deal);
          byMonth[monthKey].total += (deal.value || 0) / 100;
        }
      }
    });
  });

  console.log("📊 Faturamento por mês (baseado em diferentes campos de data):\n");
  Object.entries(byMonth)
    .sort(([a], [b]) => b.localeCompare(a))
    .forEach(([month, data]) => {
      console.log(`${month}: R$ ${data.total.toFixed(2)} (${data.deals.length} deals)`);
    });
}

checkRecentDeals()
  .then(() => {
    console.log("\n✅ Verificação concluída");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Erro:", error);
    process.exit(1);
  });

