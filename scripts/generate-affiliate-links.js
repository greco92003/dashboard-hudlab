/**
 * Script para gerar autolinks de afiliado para todas as marcas
 * 
 * Como usar:
 * 1. Certifique-se de estar logado como admin/owner no dashboard
 * 2. Abra o Console do navegador (F12)
 * 3. Cole este script e pressione Enter
 * 4. Aguarde a execução
 */

async function generateAffiliateLinks() {
  console.log('🔗 Iniciando geração de autolinks...');
  
  try {
    const response = await fetch('/api/admin/process-auto-affiliate-links', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Erro ao processar autolinks');
    }

    const data = await response.json();
    
    console.log('✅ Processamento concluído!');
    console.log(`📊 Total de marcas: ${data.stats.total}`);
    console.log(`✅ Links criados: ${data.stats.processed}`);
    console.log(`❌ Erros: ${data.stats.errors}`);
    
    if (data.errors && data.errors.length > 0) {
      console.log('⚠️ Detalhes dos erros:');
      data.errors.forEach(error => console.log(`  - ${error}`));
    }
    
    return data;
  } catch (error) {
    console.error('❌ Erro:', error.message);
    throw error;
  }
}

// Executar
generateAffiliateLinks();

