require("dotenv").config({ path: ".env.local" });

const BASE_URL = process.env.NEXT_PUBLIC_AC_BASE_URL;
const API_TOKEN = process.env.AC_API_TOKEN;

async function checkDealInActiveCampaign() {
  console.log("🔍 Verificando deal 10782 no ActiveCampaign...\n");

  try {
    // 1. Buscar informações básicas do deal
    const dealUrl = `${BASE_URL}/api/3/deals/10782`;
    const dealResponse = await fetch(dealUrl, {
      headers: {
        "Api-Token": API_TOKEN,
      },
    });

    if (!dealResponse.ok) {
      throw new Error(`Failed to fetch deal: ${dealResponse.statusText}`);
    }

    const dealData = await dealResponse.json();
    const deal = dealData.deal;

    console.log("✅ Deal 10782 encontrado no ActiveCampaign:");
    console.log("   ID:", deal.id);
    console.log("   Título:", deal.title);
    console.log("   Valor:", `R$ ${(parseFloat(deal.value || "0") / 100).toFixed(2)}`);
    console.log("   Status:", deal.status, "(0=Open, 1=Won, 2=Lost)");
    console.log("   Created:", deal.cdate);
    console.log("   Updated:", deal.mdate);

    // 2. Buscar custom fields do deal
    console.log("\n📋 Buscando custom fields...");
    const fieldsUrl = `${BASE_URL}/api/3/deals/10782/dealCustomFieldData`;
    const fieldsResponse = await fetch(fieldsUrl, {
      headers: {
        "Api-Token": API_TOKEN,
      },
    });

    if (!fieldsResponse.ok) {
      throw new Error(`Failed to fetch custom fields: ${fieldsResponse.statusText}`);
    }

    const fieldsData = await fieldsResponse.json();
    const customFields = fieldsData.dealCustomFieldData || [];

    console.log(`\n✅ Custom Fields encontrados: ${customFields.length}`);
    
    // Procurar especificamente pelo Field 5 (Data Fechamento)
    const field5 = customFields.find(f => f.customFieldId === "5");
    
    if (field5) {
      console.log("\n✅ Campo 'Data Fechamento' (Field 5) ENCONTRADO:");
      console.log("   Valor:", field5.fieldValue);
      console.log("   Criado em:", field5.cdate);
      console.log("   Atualizado em:", field5.udate);
      console.log("\n💡 O campo está preenchido no ActiveCampaign!");
      console.log("   Execute uma sincronização manual para atualizar o banco de dados.");
    } else {
      console.log("\n❌ Campo 'Data Fechamento' (Field 5) NÃO ENCONTRADO!");
      console.log("\n⚠️  AÇÃO NECESSÁRIA:");
      console.log("   1. Acesse o deal 10782 no ActiveCampaign");
      console.log("   2. Preencha o campo 'Data Fechamento'");
      console.log("   3. Execute uma sincronização manual no dashboard");
    }

    // Mostrar todos os custom fields para referência
    console.log("\n📋 Todos os custom fields do deal:");
    customFields.forEach(field => {
      console.log(`   Field ${field.customFieldId}: ${field.fieldValue}`);
    });

  } catch (error) {
    console.error("❌ Erro:", error.message);
  }
}

checkDealInActiveCampaign();

