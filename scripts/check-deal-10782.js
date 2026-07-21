require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  (process.env.DASHBOARD_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
);

async function checkDeal10782() {
  console.log("🔍 Verificando deal 10782 no banco de dados...\n");

  // Buscar o deal no banco
  const { data: deal, error } = await supabase
    .from("deals_cache")
    .select("*")
    .eq("deal_id", "10782")
    .single();

  if (error) {
    console.error("❌ Erro ao buscar deal:", error);
    return;
  }

  if (!deal) {
    console.log("❌ Deal 10782 NÃO encontrado no banco de dados");
    console.log("   O deal pode não ter sido sincronizado ainda.");
    return;
  }

  console.log("✅ Deal 10782 encontrado no banco:");
  console.log("   ID:", deal.deal_id);
  console.log("   Título:", deal.title);
  console.log("   Valor:", `R$ ${(parseFloat(deal.value || "0") / 100).toFixed(2)}`);
  console.log("   Status:", deal.status, "(0=Open, 1=Won, 2=Lost)");
  console.log("   Sync Status:", deal.sync_status);
  console.log("   Closing Date:", deal.closing_date || "❌ NÃO DEFINIDA");
  console.log("   Created Date:", deal.created_date);
  console.log("   Custom Field Value (Field 5):", deal.custom_field_value || "❌ NÃO DEFINIDA");
  console.log("   Vendedor:", deal.vendedor);
  console.log("   Designer:", deal.designer);
  console.log("   Estado:", deal.estado);
  console.log("   Quantidade de Pares:", deal["quantidade-de-pares"]);
  console.log("   Last Synced:", deal.last_synced_at);

  // Verificar se o deal atende aos critérios de exibição
  console.log("\n📋 Análise de critérios de exibição:");
  console.log("   ✓ Sync Status = 'synced'?", deal.sync_status === "synced" ? "✅ SIM" : "❌ NÃO");
  console.log("   ✓ Closing Date não nulo?", deal.closing_date ? "✅ SIM" : "❌ NÃO - ESTE É O PROBLEMA!");
  
  if (!deal.closing_date) {
    console.log("\n⚠️  PROBLEMA IDENTIFICADO:");
    console.log("   O deal 10782 não aparece porque não tem closing_date definida.");
    console.log("   A query em /api/deals-cache filtra apenas deals com closing_date não nulo.");
    console.log("\n💡 SOLUÇÃO:");
    console.log("   1. Verificar se o campo 'Data Fechamento' (Field 5) está preenchido no ActiveCampaign");
    console.log("   2. Se estiver preenchido, executar uma nova sincronização");
    console.log("   3. Se não estiver, preencher o campo no ActiveCampaign e sincronizar");
  }

  // Verificar também o deal 32118
  console.log("\n\n🔍 Verificando deal 32118 (que estava no lugar)...\n");
  
  const { data: deal32118, error: error32118 } = await supabase
    .from("deals_cache")
    .select("*")
    .eq("deal_id", "32118")
    .single();

  if (error32118) {
    console.log("❌ Deal 32118 não encontrado ou erro:", error32118.message);
  } else if (deal32118) {
    console.log("✅ Deal 32118 encontrado:");
    console.log("   Título:", deal32118.title);
    console.log("   Valor:", `R$ ${(parseFloat(deal32118.value || "0") / 100).toFixed(2)}`);
    console.log("   Status:", deal32118.status, "(0=Open, 1=Won, 2=Lost)");
    console.log("   Closing Date:", deal32118.closing_date || "NÃO DEFINIDA");
  }
}

checkDeal10782().catch(console.error);

