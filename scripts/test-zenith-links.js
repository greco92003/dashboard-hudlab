/**
 * Script para testar a criação dos links da Zenith com franquias
 * 
 * Como usar:
 * 1. Abra o Console do navegador (F12) enquanto estiver logado como admin
 * 2. Cole este script e pressione Enter
 */

async function testZenithLinks() {
  console.log('🔍 Testando criação de links da Zenith...\n');
  
  try {
    // Chamar a API de processamento
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
      console.log('\n⚠️ Detalhes dos erros:');
      data.errors.forEach(error => console.log(`  - ${error}`));
    }
    
    console.log('\n🔍 Verificando links da Zenith criados...');
    
    // Buscar links da Zenith
    const linksResponse = await fetch('/api/partners/affiliate-links?brand=Zenith');
    const linksData = await linksResponse.json();
    
    console.log(`\n📋 Links da Zenith encontrados: ${linksData.links?.length || 0}`);
    
    if (linksData.links && linksData.links.length > 0) {
      linksData.links.forEach(link => {
        const franchise = link.url.includes('Santos-SP') ? '🏖️ Santos-SP' :
                         link.url.includes('Garopaba-SC') ? '🌊 Garopaba-SC' :
                         link.url.includes('Taquara-RS') ? '🏔️ Taquara-RS' :
                         '❓ Sem franquia';
        console.log(`  ${franchise}: ${link.url}`);
      });
      
      // Verificar se tem todas as 3 franquias
      const hasSantos = linksData.links.some(l => l.url.includes('Santos-SP'));
      const hasGaropaba = linksData.links.some(l => l.url.includes('Garopaba-SC'));
      const hasTaquara = linksData.links.some(l => l.url.includes('Taquara-RS'));
      
      console.log('\n✅ Status das franquias:');
      console.log(`  Santos-SP: ${hasSantos ? '✅' : '❌'}`);
      console.log(`  Garopaba-SC: ${hasGaropaba ? '✅' : '❌'}`);
      console.log(`  Taquara-RS: ${hasTaquara ? '✅' : '❌'}`);
      
      if (hasSantos && hasGaropaba && hasTaquara) {
        console.log('\n🎉 SUCESSO! Todas as 3 franquias da Zenith têm links!');
      } else {
        console.log('\n⚠️ ATENÇÃO! Algumas franquias ainda não têm links.');
      }
    } else {
      console.log('❌ Nenhum link da Zenith encontrado!');
    }
    
    return data;
  } catch (error) {
    console.error('❌ Erro:', error.message);
    throw error;
  }
}

// Executar
testZenithLinks();

