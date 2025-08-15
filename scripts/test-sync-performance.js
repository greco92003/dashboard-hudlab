#!/usr/bin/env node

/**
 * Script para testar e comparar a performance entre as implementações
 * original e paralela do robust-deals-sync
 */

const https = require('https');
const http = require('http');

// Configuração
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const TEST_CONFIGS = [
  { maxDeals: 100, description: 'Teste pequeno (100 deals)' },
  { maxDeals: 500, description: 'Teste médio (500 deals)' },
  { maxDeals: 1000, description: 'Teste grande (1000 deals)' },
];

// Função para fazer requisições HTTP
function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https:') ? https : http;
    const startTime = Date.now();
    
    console.log(`🚀 Iniciando requisição: ${url}`);
    
    const req = protocol.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        try {
          const result = JSON.parse(data);
          resolve({
            success: true,
            duration,
            data: result,
            statusCode: res.statusCode
          });
        } catch (error) {
          reject({
            success: false,
            duration,
            error: 'Failed to parse JSON response',
            statusCode: res.statusCode,
            rawData: data
          });
        }
      });
    });
    
    req.on('error', (error) => {
      const endTime = Date.now();
      const duration = endTime - startTime;
      reject({
        success: false,
        duration,
        error: error.message
      });
    });
    
    // Timeout de 10 minutos
    req.setTimeout(600000, () => {
      req.destroy();
      reject({
        success: false,
        duration: 600000,
        error: 'Request timeout (10 minutes)'
      });
    });
  });
}

// Função para executar teste de uma implementação
async function testImplementation(endpoint, config) {
  const url = `${BASE_URL}${endpoint}?dryRun=true&maxDeals=${config.maxDeals}`;
  
  try {
    const result = await makeRequest(url);
    
    if (!result.success) {
      throw new Error(`Request failed: ${result.error}`);
    }
    
    if (result.statusCode !== 200) {
      throw new Error(`HTTP ${result.statusCode}: ${result.data?.error || 'Unknown error'}`);
    }
    
    return {
      success: true,
      duration: result.duration,
      summary: result.data.summary,
      endpoint: endpoint
    };
  } catch (error) {
    return {
      success: false,
      duration: error.duration || 0,
      error: error.message || error.error,
      endpoint: endpoint
    };
  }
}

// Função para formatar duração
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

// Função para calcular melhoria percentual
function calculateImprovement(original, parallel) {
  if (!original || !parallel) return 'N/A';
  const improvement = ((original - parallel) / original) * 100;
  return improvement > 0 ? `${improvement.toFixed(1)}% mais rápido` : `${Math.abs(improvement).toFixed(1)}% mais lento`;
}

// Função principal de teste
async function runPerformanceTest() {
  console.log('🧪 TESTE DE PERFORMANCE - ROBUST DEALS SYNC');
  console.log('='.repeat(60));
  console.log(`📍 Base URL: ${BASE_URL}`);
  console.log(`📊 Configurações de teste: ${TEST_CONFIGS.length}`);
  console.log('');
  
  const results = [];
  
  for (const config of TEST_CONFIGS) {
    console.log(`🎯 ${config.description}`);
    console.log('-'.repeat(40));
    
    // Teste da implementação original
    console.log('📈 Testando implementação original...');
    const originalResult = await testImplementation('/api/test/robust-deals-sync', config);
    
    if (originalResult.success) {
      console.log(`✅ Original: ${formatDuration(originalResult.duration)}`);
      console.log(`   📊 Deals: ${originalResult.summary.totalDeals}`);
      console.log(`   📊 Custom Fields: ${originalResult.summary.totalCustomFieldEntries}`);
    } else {
      console.log(`❌ Original falhou: ${originalResult.error}`);
    }
    
    // Pequena pausa entre testes
    console.log('⏳ Aguardando 5 segundos...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Teste da implementação paralela
    console.log('⚡ Testando implementação paralela...');
    const parallelResult = await testImplementation('/api/test/robust-deals-sync-parallel', config);
    
    if (parallelResult.success) {
      console.log(`✅ Paralela: ${formatDuration(parallelResult.duration)}`);
      console.log(`   📊 Deals: ${parallelResult.summary.totalDeals}`);
      console.log(`   📊 Custom Fields: ${parallelResult.summary.totalCustomFieldEntries}`);
      console.log(`   📊 Performance: ${parallelResult.summary.performance?.dealsPerSecond?.toFixed(1)} deals/sec`);
      console.log(`   📊 Rate Limit: ${parallelResult.summary.rateLimit?.REQUESTS_PER_SECOND} req/sec`);
    } else {
      console.log(`❌ Paralela falhou: ${parallelResult.error}`);
    }
    
    // Comparação
    if (originalResult.success && parallelResult.success) {
      const improvement = calculateImprovement(originalResult.duration, parallelResult.duration);
      console.log(`🏆 Melhoria: ${improvement}`);
    }
    
    results.push({
      config,
      original: originalResult,
      parallel: parallelResult
    });
    
    console.log('');
  }
  
  // Resumo final
  console.log('📋 RESUMO DOS RESULTADOS');
  console.log('='.repeat(60));
  
  results.forEach((result, index) => {
    console.log(`${index + 1}. ${result.config.description}`);
    
    if (result.original.success && result.parallel.success) {
      console.log(`   Original:  ${formatDuration(result.original.duration)}`);
      console.log(`   Paralela:  ${formatDuration(result.parallel.duration)}`);
      console.log(`   Melhoria:  ${calculateImprovement(result.original.duration, result.parallel.duration)}`);
    } else {
      console.log(`   ❌ Teste incompleto`);
      if (!result.original.success) console.log(`      Original: ${result.original.error}`);
      if (!result.parallel.success) console.log(`      Paralela: ${result.parallel.error}`);
    }
    console.log('');
  });
  
  // Recomendações
  console.log('💡 RECOMENDAÇÕES');
  console.log('='.repeat(60));
  
  const successfulTests = results.filter(r => r.original.success && r.parallel.success);
  
  if (successfulTests.length > 0) {
    const avgOriginal = successfulTests.reduce((sum, r) => sum + r.original.duration, 0) / successfulTests.length;
    const avgParallel = successfulTests.reduce((sum, r) => sum + r.parallel.duration, 0) / successfulTests.length;
    const avgImprovement = calculateImprovement(avgOriginal, avgParallel);
    
    console.log(`📊 Melhoria média: ${avgImprovement}`);
    
    if (avgParallel < avgOriginal) {
      console.log('✅ A implementação paralela mostrou melhor performance');
      console.log('🚀 Recomenda-se migrar para a versão paralela');
    } else {
      console.log('⚠️  A implementação paralela não mostrou melhoria significativa');
      console.log('🔍 Revisar configurações de rate limiting e batch size');
    }
  } else {
    console.log('❌ Não foi possível completar comparações válidas');
    console.log('🔧 Verificar configuração do ambiente e conectividade');
  }
  
  console.log('');
  console.log('🏁 Teste de performance concluído!');
}

// Executar o teste
if (require.main === module) {
  runPerformanceTest().catch(error => {
    console.error('❌ Erro durante o teste:', error);
    process.exit(1);
  });
}

module.exports = { runPerformanceTest, testImplementation };
