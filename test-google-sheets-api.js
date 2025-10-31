// Script para testar se o Google Sheets API está funcionando
// Execute com: node test-google-sheets-api.js

const { google } = require("googleapis");
require("dotenv").config({ path: ".env.local" });

async function testGoogleSheetsAPI() {
  console.log("🔍 Testando Google Sheets API...\n");

  try {
    // 1. Verificar variáveis de ambiente
    console.log("📋 1. Verificando variáveis de ambiente:");
    const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(
      /\\n/g,
      "\n"
    );
    const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
    const projectId = process.env.GOOGLE_SHEETS_PROJECT_ID;
    const spreadsheetId =
      process.env.NEXT_PUBLIC_GOOGLE_SHEETS_DESIGNER_FOLLOW_UP_ID;

    console.log(
      `   📧 Client Email: ${
        clientEmail ? "✅ Configurado" : "❌ Não configurado"
      }`
    );
    console.log(
      `   🆔 Project ID: ${projectId ? "✅ Configurado" : "❌ Não configurado"}`
    );
    console.log(
      `   🔑 Private Key: ${
        privateKey ? "✅ Configurado" : "❌ Não configurado"
      }`
    );
    console.log(
      `   📊 Spreadsheet ID: ${
        spreadsheetId ? "✅ Configurado" : "❌ Não configurado"
      }\n`
    );

    if (!privateKey || !clientEmail || !spreadsheetId) {
      throw new Error("❌ Variáveis de ambiente não configuradas corretamente");
    }

    // 2. Configurar autenticação
    console.log("🔐 2. Configurando autenticação...");
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
      scopes: [
        "https://www.googleapis.com/auth/spreadsheets.readonly",
        "https://www.googleapis.com/auth/drive.readonly",
      ],
    });

    const authClient = await auth.getClient();
    console.log("   ✅ Cliente de autenticação criado\n");

    // 3. Criar cliente do Google Sheets
    console.log("📊 3. Criando cliente do Google Sheets...");
    const sheets = google.sheets({ version: "v4", auth: authClient });
    console.log("   ✅ Cliente do Google Sheets criado\n");

    // 4. Testar acesso à planilha
    console.log("🔍 4. Testando acesso à planilha...");
    console.log(`   📋 Spreadsheet ID: ${spreadsheetId}`);
    console.log(`   📄 Range: Mockups Feitos!A1:Z5000`);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: "Mockups Feitos!A1:Z5000",
    });

    const values = response.data.values || [];
    console.log(`   ✅ Sucesso! Dados obtidos: ${values.length} linhas\n`);

    // 5. Mostrar dados obtidos
    console.log("📋 5. Dados obtidos da planilha:");
    if (values.length > 0) {
      console.log("   📊 Headers (primeira linha):");
      console.log(`      ${values[0].join(" | ")}\n`);

      if (values.length > 1) {
        console.log("   📝 Primeiras linhas de dados:");
        values.slice(1, Math.min(4, values.length)).forEach((row, index) => {
          console.log(
            `      Linha ${index + 2}: ${row.slice(0, 3).join(" | ")}...`
          );
        });
      }
    } else {
      console.log("   ⚠️ Nenhum dado encontrado na planilha");
    }

    console.log("\n✅ TESTE CONCLUÍDO COM SUCESSO!");
    console.log("   O Google Sheets API está funcionando corretamente.");

    return true;
  } catch (error) {
    console.log("\n❌ TESTE FALHOU!");
    console.error("   Erro:", error.message);

    // Diagnóstico específico de erros comuns
    if (error.message.includes("403")) {
      console.log("\n🔍 DIAGNÓSTICO:");
      console.log("   ❌ Erro 403 (Forbidden) - Possíveis causas:");
      console.log("      1. Service account não tem permissão na planilha");
      console.log(
        "      2. Planilha não foi compartilhada com o service account"
      );
      console.log("      3. APIs não estão habilitadas no Google Cloud");
      console.log("\n💡 SOLUÇÕES:");
      console.log(
        "   1. Compartilhe a planilha com:",
        process.env.GOOGLE_SHEETS_CLIENT_EMAIL
      );
      console.log(
        "   2. Verifique se as APIs estão habilitadas no Google Cloud Console"
      );
      console.log("   3. Verifique se o projeto está em modo de produção");
    } else if (error.message.includes("404")) {
      console.log("\n🔍 DIAGNÓSTICO:");
      console.log("   ❌ Erro 404 (Not Found) - Possíveis causas:");
      console.log("      1. ID da planilha está incorreto");
      console.log('      2. Nome da aba "Mockups Feitos" está incorreto');
      console.log("      3. Planilha foi deletada ou movida");
    } else if (error.message.includes("401")) {
      console.log("\n🔍 DIAGNÓSTICO:");
      console.log("   ❌ Erro 401 (Unauthorized) - Possíveis causas:");
      console.log("      1. Credenciais da service account estão incorretas");
      console.log("      2. Private key está malformada");
      console.log("      3. Client email está incorreto");
    }

    return false;
  }
}

// Executar o teste
if (require.main === module) {
  testGoogleSheetsAPI()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error("Erro inesperado:", error);
      process.exit(1);
    });
}

module.exports = { testGoogleSheetsAPI };
