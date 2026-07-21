import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  (process.env.DASHBOARD_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!
);

async function testOTETotals() {
  console.log("🔍 Testando cálculo de totais OTE\n");

  // Buscar deals de janeiro/2026
  const { data: allDeals } = await supabase
    .from("deals_cache")
    .select("*")
    .eq("sync_status", "synced")
    .not("closing_date", "is", null)
    .gte("closing_date", "2026-01-01")
    .lte("closing_date", "2026-01-31");

  console.log(`📊 Total de deals no período: ${allDeals?.length || 0}\n`);

  if (!allDeals || allDeals.length === 0) {
    console.log("❌ Nenhum deal encontrado!");
    return;
  }

  // Filtrar apenas deals ganhos
  const wonDeals = allDeals.filter(
    (deal: any) =>
      deal.status === "won" || deal.status === "1" || deal.status === 1
  );

  console.log(`✅ Deals ganhos (won/1): ${wonDeals.length}\n`);

  // Calcular totais
  const totalSales = wonDeals.reduce((sum: number, deal: any) => {
    return sum + (deal.value || 0) / 100;
  }, 0);

  const totalPairs = wonDeals.reduce((sum: number, deal: any) => {
    const pairs = parseInt(deal["quantidade-de-pares"] || "0");
    return sum + pairs;
  }, 0);

  console.log("📈 TOTAIS DA EMPRESA:");
  console.log(`   Faturamento: R$ ${totalSales.toFixed(2)}`);
  console.log(`   Negócios: ${wonDeals.length}`);
  console.log(`   Pares: ${totalPairs}\n`);

  // Mostrar alguns deals com quantidade de pares
  console.log("📦 Amostra de deals com pares:");
  wonDeals.slice(0, 10).forEach((deal: any, i: number) => {
    const pairs = parseInt(deal["quantidade-de-pares"] || "0");
    console.log(
      `   ${i + 1}. ${deal.title} - ${pairs} pares - R$ ${((deal.value || 0) / 100).toFixed(2)}`
    );
  });

  // Verificar se há deals sem quantidade de pares
  const dealsWithoutPairs = wonDeals.filter(
    (deal: any) => !deal["quantidade-de-pares"] || deal["quantidade-de-pares"] === "0"
  );

  console.log(`\n⚠️  Deals sem quantidade de pares: ${dealsWithoutPairs.length}`);
  if (dealsWithoutPairs.length > 0) {
    console.log("   Exemplos:");
    dealsWithoutPairs.slice(0, 5).forEach((deal: any, i: number) => {
      console.log(`   ${i + 1}. ${deal.title} - R$ ${((deal.value || 0) / 100).toFixed(2)}`);
    });
  }
}

testOTETotals()
  .then(() => {
    console.log("\n✅ Teste concluído");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Erro:", error);
    process.exit(1);
  });

