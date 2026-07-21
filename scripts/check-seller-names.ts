import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { normalizeSellerName } from "../lib/utils/normalize-names";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  (process.env.DASHBOARD_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!
);

async function checkSellerNames() {
  console.log("🔍 Verificando nomes de vendedores\n");

  // 1. Buscar vendedores cadastrados no OTE
  console.log("1️⃣ Vendedores cadastrados no sistema OTE:");
  const { data: sellers } = await supabase
    .from("ote_sellers")
    .select("*")
    .eq("active", true);

  if (sellers) {
    sellers.forEach((s) => {
      console.log(`   - ${s.seller_name} (normalizado: ${normalizeSellerName(s.seller_name)})`);
    });
  }

  // 2. Buscar nomes únicos de vendedores nos deals de janeiro
  console.log("\n2️⃣ Vendedores nos deals de janeiro/2026:");
  const { data: janDeals } = await supabase
    .from("deals_cache")
    .select("vendedor")
    .eq("sync_status", "synced")
    .not("closing_date", "is", null)
    .gte("closing_date", "2026-01-01")
    .lte("closing_date", "2026-01-31");

  if (janDeals) {
    const uniqueVendedores = [...new Set(janDeals.map((d) => d.vendedor))];
    uniqueVendedores.forEach((v) => {
      const normalized = normalizeSellerName(v || "");
      console.log(`   - "${v}" → normalizado: "${normalized}"`);
    });
  }

  // 3. Testar matching
  console.log("\n3️⃣ Testando matching entre vendedores OTE e deals:");
  if (sellers && janDeals) {
    sellers.forEach((seller) => {
      const normalizedSeller = normalizeSellerName(seller.seller_name);
      const matchingDeals = janDeals.filter((deal) => {
        const normalizedDeal = normalizeSellerName(deal.vendedor || "");
        return normalizedDeal === normalizedSeller;
      });
      
      const total = matchingDeals.length;
      console.log(`   ${seller.seller_name}: ${total} deals encontrados`);
    });
  }
}

checkSellerNames()
  .then(() => {
    console.log("\n✅ Verificação concluída");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Erro:", error);
    process.exit(1);
  });

