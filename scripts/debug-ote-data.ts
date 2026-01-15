import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function debugOTEData() {
  console.log("🔍 DEBUG OTE - Verificando dados\n");

  // 1. Verificar total de deals na tabela
  console.log("1️⃣ Verificando total de deals na tabela deals_cache...");
  const { count: totalDeals } = await supabase
    .from("deals_cache")
    .select("*", { count: "exact", head: true });

  console.log(`   Total de deals na tabela: ${totalDeals || 0}\n`);

  // 2. Verificar deals com sync_status = "synced"
  const { count: syncedDeals } = await supabase
    .from("deals_cache")
    .select("*", { count: "exact", head: true })
    .eq("sync_status", "synced");

  console.log(`   Deals com sync_status = "synced": ${syncedDeals || 0}\n`);

  // 3. Verificar deals com closing_date não nulo
  const { count: dealsWithDate } = await supabase
    .from("deals_cache")
    .select("*", { count: "exact", head: true })
    .eq("sync_status", "synced")
    .not("closing_date", "is", null);

  console.log(`   Deals com closing_date não nulo: ${dealsWithDate || 0}\n`);

  // 4. Buscar alguns deals recentes para ver as datas
  console.log("2️⃣ Buscando deals recentes...");
  const { data: recentDeals } = await supabase
    .from("deals_cache")
    .select("deal_id, title, value, status, closing_date, created_date, sync_status, vendedor")
    .eq("sync_status", "synced")
    .not("closing_date", "is", null)
    .order("closing_date", { ascending: false })
    .limit(10);

  if (recentDeals && recentDeals.length > 0) {
    console.log(`   Encontrados ${recentDeals.length} deals recentes:\n`);
    recentDeals.forEach((deal, i) => {
      console.log(`   ${i + 1}. ${deal.title}`);
      console.log(`      Valor: R$ ${((deal.value || 0) / 100).toFixed(2)}`);
      console.log(`      Status: ${deal.status}`);
      console.log(`      Vendedor: ${deal.vendedor || "N/A"}`);
      console.log(`      closing_date: ${deal.closing_date}`);
      console.log(`      sync_status: ${deal.sync_status}\n`);
    });
  } else {
    console.log("   ⚠️  Nenhum deal recente encontrado!\n");
  }

  // 5. Verificar deals de janeiro/2026 especificamente
  console.log("3️⃣ Verificando deals de janeiro/2026...");
  const { data: janDeals, count: janCount } = await supabase
    .from("deals_cache")
    .select("*", { count: "exact" })
    .eq("sync_status", "synced")
    .not("closing_date", "is", null)
    .gte("closing_date", "2026-01-01")
    .lte("closing_date", "2026-01-31");

  console.log(`   Deals em janeiro/2026: ${janCount || 0}`);
  
  if (janDeals && janDeals.length > 0) {
    const total = janDeals.reduce((sum, d) => sum + (d.value || 0) / 100, 0);
    console.log(`   Faturamento total: R$ ${total.toFixed(2)}\n`);
    
    // Agrupar por vendedor
    const byVendedor: Record<string, number> = {};
    janDeals.forEach((d) => {
      const v = d.vendedor || "Sem vendedor";
      byVendedor[v] = (byVendedor[v] || 0) + (d.value || 0) / 100;
    });
    
    console.log("   Por vendedor:");
    Object.entries(byVendedor).forEach(([v, total]) => {
      console.log(`      ${v}: R$ ${total.toFixed(2)}`);
    });
  }

  // 6. Verificar se há deals com status "won"
  console.log("\n4️⃣ Verificando deals com status 'won'...");
  const { count: wonDeals } = await supabase
    .from("deals_cache")
    .select("*", { count: "exact", head: true })
    .eq("sync_status", "synced")
    .eq("status", "won")
    .not("closing_date", "is", null);

  console.log(`   Deals com status 'won': ${wonDeals || 0}\n`);

  // 7. Verificar última sincronização
  console.log("5️⃣ Verificando última sincronização...");
  const { data: lastSync } = await supabase
    .from("deals_sync_log")
    .select("*")
    .order("sync_started_at", { ascending: false })
    .limit(1)
    .single();

  if (lastSync) {
    console.log(`   Última sincronização:`);
    console.log(`      Status: ${lastSync.sync_status}`);
    console.log(`      Iniciada em: ${lastSync.sync_started_at}`);
    console.log(`      Concluída em: ${lastSync.sync_completed_at || "N/A"}`);
    console.log(`      Deals processados: ${lastSync.deals_processed || 0}`);
  } else {
    console.log("   ⚠️  Nenhuma sincronização encontrada!");
  }
}

debugOTEData()
  .then(() => {
    console.log("\n✅ Debug concluído");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Erro:", error);
    process.exit(1);
  });

