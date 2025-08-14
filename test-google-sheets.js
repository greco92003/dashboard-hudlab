// Script para testar se o Google Sheets está funcionando em produção
const { google } = require('googleapis');

async function testGoogleSheets() {
  try {
    console.log('🔍 Testando conexão com Google Sheets...');
    
    // Configuração das credenciais
    const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
    const projectId = process.env.GOOGLE_SHEETS_PROJECT_ID;
    
    console.log('📧 Service Account:', clientEmail);
    console.log('🆔 Project ID:', projectId);
    console.log('🔑 Private Key Length:', privateKey?.length || 0);
    
    if (!privateKey || !clientEmail) {
      throw new Error('Credenciais do Google Sheets não configuradas');
    }
    
    // Criar autenticação
    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.readonly',
      ],
    });
    
    // Autorizar
    await auth.authorize();
    console.log('✅ Autenticação bem-sucedida');
    
    // Testar acesso a uma planilha
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.NEXT_PUBLIC_GOOGLE_SHEETS_DESIGNER_FOLLOW_UP_ID;
    
    if (spreadsheetId) {
      console.log('📊 Testando acesso à planilha:', spreadsheetId);
      
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'A1:A1', // Apenas uma célula para teste
      });
      
      console.log('✅ Acesso à planilha bem-sucedido');
      console.log('📋 Dados retornados:', response.data.values || 'Nenhum dado');
    }
    
    console.log('🎉 Teste concluído com sucesso! Google Sheets está funcionando.');
    
  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
    
    if (error.message.includes('403')) {
      console.log('💡 Dica: Verifique se o app foi publicado no Google Cloud Console');
      console.log('💡 Dica: Verifique se a Service Account tem acesso à planilha');
    }
    
    if (error.message.includes('404')) {
      console.log('💡 Dica: Verifique se o ID da planilha está correto');
    }
    
    process.exit(1);
  }
}

// Executar teste
testGoogleSheets();
