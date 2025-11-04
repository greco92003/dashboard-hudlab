import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

// Carregar variáveis de ambiente
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkDeal() {
  console.log("🔍 Verificando deal_id: 12622...\n");

  // Buscar o deal específico
  const { data: deal, error } = await supabase
    .from("deals_cache")
    .select("*")
    .eq("deal_id", "12622")
    .single();

  if (error) {
    console.error("❌ Erro ao buscar deal:", error);
    return;
  }

  if (!deal) {
    console.log("❌ Deal não encontrado no banco de dados");
    return;
  }

  console.log("✅ Deal encontrado:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Deal ID: ${deal.deal_id}`);
  console.log(`Título: ${deal.title}`);
  console.log(`Valor: R$ ${(deal.value / 100).toFixed(2)}`);
  console.log(`Status: ${deal.status}`);
  console.log(`Sync Status: ${deal.sync_status}`);
  console.log(`Data de Fechamento: ${deal.closing_date}`);
  console.log(`Data de Criação: ${deal.created_date}`);
  console.log(`Estado: ${deal.estado || "N/A"}`);
  console.log(`Vendedor: ${deal.vendedor || "N/A"}`);
  console.log(`Designer: ${deal.designer || "N/A"}`);
  console.log(`Contact ID: ${deal.contact_id || "N/A"}`);
  console.log(`Última sincronização: ${deal.last_synced_at}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Verificar se a data está no formato correto
  if (deal.closing_date) {
    const closingDate = new Date(deal.closing_date);
    console.log(`📅 Data de fechamento parseada: ${closingDate.toISOString()}`);
    console.log(
      `📅 Data de fechamento (local): ${closingDate.toLocaleDateString(
        "pt-BR"
      )}`
    );
  }

  // Verificar quantos deals existem no período que inclui esta data
  const { data: dealsInPeriod, error: periodError } = await supabase
    .from("deals_cache")
    .select("deal_id, title, closing_date, status, sync_status")
    .eq("sync_status", "synced")
    .not("closing_date", "is", null)
    .gte("closing_date", "2025-10-01")
    .lte("closing_date", "2025-10-31");

  if (periodError) {
    console.error("❌ Erro ao buscar deals do período:", periodError);
  } else {
    console.log(
      `\n📊 Total de deals em outubro/2025: ${dealsInPeriod?.length || 0}`
    );
    if (dealsInPeriod && dealsInPeriod.length > 0) {
      console.log("\nPrimeiros 5 deals do período:");
      dealsInPeriod.slice(0, 5).forEach((d) => {
        console.log(
          `  - ${d.deal_id}: ${d.title} (${d.closing_date}) - Status: ${d.status}`
        );
      });
    }
  }

  // Verificar se o deal específico está na lista
  const dealInList = dealsInPeriod?.find((d) => d.deal_id === "12622");
  if (dealInList) {
    console.log("\n✅ Deal 12622 ESTÁ na lista de deals do período");
  } else {
    console.log("\n❌ Deal 12622 NÃO está na lista de deals do período");
    console.log("Possíveis razões:");
    console.log("  - sync_status diferente de 'synced'");
    console.log("  - closing_date é null");
    console.log("  - closing_date fora do período 2025-10-01 a 2025-10-31");
  }

  // Verificar período padrão do dashboard (últimos 30 dias)
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📅 Verificando período padrão do dashboard (últimos 30 dias):");

  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const startDate = formatDate(thirtyDaysAgo);
  const endDate = formatDate(today);

  console.log(`Data atual: ${formatDate(today)}`);
  console.log(`Período: ${startDate} até ${endDate}`);
  console.log(`Data do deal 12622: 2025-10-24`);

  // Verificar se a data do deal está dentro do período
  const dealDate = new Date("2025-10-24");
  const isInPeriod = dealDate >= thirtyDaysAgo && dealDate <= today;

  if (isInPeriod) {
    console.log(
      "✅ A data do deal ESTÁ dentro do período padrão (últimos 30 dias)"
    );
  } else {
    console.log(
      "❌ A data do deal NÃO está dentro do período padrão (últimos 30 dias)"
    );
    console.log(
      `   Deal está ${Math.floor(
        (today.getTime() - dealDate.getTime()) / (1000 * 60 * 60 * 24)
      )} dias atrás`
    );
  }

  // Buscar deals no período padrão
  const { data: dealsInDefaultPeriod, error: defaultPeriodError } =
    await supabase
      .from("deals_cache")
      .select("deal_id, title, closing_date, status")
      .eq("sync_status", "synced")
      .not("closing_date", "is", null)
      .gte("closing_date", startDate)
      .lte("closing_date", endDate);

  if (defaultPeriodError) {
    console.error(
      "❌ Erro ao buscar deals do período padrão:",
      defaultPeriodError
    );
  } else {
    console.log(
      `\n📊 Total de deals no período padrão (últimos 30 dias): ${
        dealsInDefaultPeriod?.length || 0
      }`
    );

    const dealInDefaultPeriod = dealsInDefaultPeriod?.find(
      (d) => d.deal_id === "12622"
    );
    if (dealInDefaultPeriod) {
      console.log("✅ Deal 12622 ESTÁ no período padrão do dashboard");
    } else {
      console.log("❌ Deal 12622 NÃO está no período padrão do dashboard");
      console.log(
        "\n💡 SOLUÇÃO: O usuário precisa ajustar o período no dashboard para incluir 24/10/2025"
      );
      console.log("   Opções:");
      console.log("   1. Selecionar 'Últimos 2 meses' ou 'Últimos 3 meses'");
      console.log(
        "   2. Usar o calendário para selecionar um período customizado que inclua outubro/2025"
      );
    }
  }
}

checkDeal().catch(console.error);
