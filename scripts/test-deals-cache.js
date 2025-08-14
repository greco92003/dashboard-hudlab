#!/usr/bin/env node

/**
 * Script para testar performance e validar dados do sistema de cache de deals
 * 
 * Uso:
 * node scripts/test-deals-cache.js
 * 
 * Ou com parâmetros:
 * node scripts/test-deals-cache.js --period=30 --baseUrl=http://localhost:3000
 */

const https = require('https');
const http = require('http');

// Configurações
const DEFAULT_BASE_URL = 'http://localhost:3000';
const DEFAULT_PERIOD = 30;

// Parse command line arguments
const args = process.argv.slice(2);
const config = {
  baseUrl: DEFAULT_BASE_URL,
  period: DEFAULT_PERIOD,
};

args.forEach(arg => {
  if (arg.startsWith('--baseUrl=')) {
    config.baseUrl = arg.split('=')[1];
  } else if (arg.startsWith('--period=')) {
    config.period = parseInt(arg.split('=')[1]);
  }
});

console.log('🚀 Iniciando testes do sistema de cache de deals...');
console.log(`📍 Base URL: ${config.baseUrl}`);
console.log(`📅 Período: ${config.period} dias`);
console.log('');

// Helper function to make HTTP requests
function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https://');
    const client = isHttps ? https : http;
    
    const startTime = Date.now();
    
    client.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        const responseTime = Date.now() - startTime;
        try {
          const jsonData = JSON.parse(data);
          resolve({
            statusCode: res.statusCode,
            data: jsonData,
            responseTime,
          });
        } catch (error) {
          reject(new Error(`Failed to parse JSON: ${error.message}`));
        }
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

// Test functions
async function testHealthEndpoint() {
  console.log('🏥 Testando endpoint de saúde...');
  
  try {
    const result = await makeRequest(`${config.baseUrl}/api/deals-health`);
    
    if (result.statusCode === 200) {
      const health = result.data;
      console.log(`✅ Status: ${health.status}`);
      console.log(`⏱️  Tempo de resposta: ${result.responseTime}ms`);
      console.log(`📊 Total de deals no cache: ${health.cache.totalDeals}`);
      console.log(`📈 Deals recentes: ${health.cache.recentDeals}`);
      console.log(`🔄 Taxa de sucesso: ${health.sync.successRate}%`);
      
      if (health.issues && health.issues.length > 0) {
        console.log(`⚠️  Problemas detectados:`);
        health.issues.forEach(issue => console.log(`   - ${issue}`));
      }
      
      return health;
    } else {
      throw new Error(`Health check failed with status ${result.statusCode}`);
    }
  } catch (error) {
    console.log(`❌ Erro no teste de saúde: ${error.message}`);
    return null;
  }
}

async function testCacheEndpoint() {
  console.log('\n💾 Testando endpoint de cache...');
  
  try {
    const result = await makeRequest(`${config.baseUrl}/api/deals-cache?period=${config.period}`);
    
    if (result.statusCode === 200) {
      const data = result.data;
      console.log(`✅ Sucesso!`);
      console.log(`⏱️  Tempo de resposta: ${result.responseTime}ms`);
      console.log(`📊 Deals retornados: ${data.deals.length}`);
      console.log(`🔄 Última sincronização: ${data.lastSync || 'N/A'}`);
      console.log(`📍 Fonte: ${data.cacheInfo?.source || 'N/A'}`);
      
      return {
        deals: data.deals,
        responseTime: result.responseTime,
        source: 'cache',
      };
    } else {
      throw new Error(`Cache endpoint failed with status ${result.statusCode}`);
    }
  } catch (error) {
    console.log(`❌ Erro no teste de cache: ${error.message}`);
    return null;
  }
}

async function testOriginalEndpoint() {
  console.log('\n🔄 Testando endpoint original (API)...');
  
  try {
    const result = await makeRequest(`${config.baseUrl}/api/active-campaign/deals-by-period?period=${config.period}`);
    
    if (result.statusCode === 200) {
      const data = result.data;
      console.log(`✅ Sucesso!`);
      console.log(`⏱️  Tempo de resposta: ${result.responseTime}ms`);
      console.log(`📊 Deals retornados: ${data.deals.length}`);
      console.log(`📍 Fonte: API original`);
      
      return {
        deals: data.deals,
        responseTime: result.responseTime,
        source: 'api',
      };
    } else {
      throw new Error(`Original API failed with status ${result.statusCode}`);
    }
  } catch (error) {
    console.log(`❌ Erro no teste da API original: ${error.message}`);
    return null;
  }
}

async function testNewEndpoint() {
  console.log('\n🆕 Testando novo endpoint (cache + fallback)...');
  
  try {
    const result = await makeRequest(`${config.baseUrl}/api/active-campaign/deals-by-period-v2?period=${config.period}`);
    
    if (result.statusCode === 200) {
      const data = result.data;
      console.log(`✅ Sucesso!`);
      console.log(`⏱️  Tempo de resposta: ${result.responseTime}ms`);
      console.log(`📊 Deals retornados: ${data.deals.length}`);
      console.log(`📍 Fonte: ${data.debug?.source || 'N/A'}`);
      
      return {
        deals: data.deals,
        responseTime: result.responseTime,
        source: data.debug?.source || 'unknown',
      };
    } else {
      throw new Error(`New endpoint failed with status ${result.statusCode}`);
    }
  } catch (error) {
    console.log(`❌ Erro no teste do novo endpoint: ${error.message}`);
    return null;
  }
}

function compareResults(cacheResult, apiResult, newResult) {
  console.log('\n📊 Comparando resultados...');
  
  const results = [
    { name: 'Cache', result: cacheResult },
    { name: 'API Original', result: apiResult },
    { name: 'Novo Endpoint', result: newResult },
  ].filter(r => r.result !== null);
  
  if (results.length === 0) {
    console.log('❌ Nenhum resultado válido para comparar');
    return;
  }
  
  // Performance comparison
  console.log('\n⚡ Comparação de Performance:');
  results.forEach(({ name, result }) => {
    console.log(`   ${name}: ${result.responseTime}ms`);
  });
  
  // Data consistency comparison
  if (results.length >= 2) {
    console.log('\n🔍 Comparação de Dados:');
    
    const dealCounts = results.map(({ name, result }) => ({
      name,
      count: result.deals.length,
    }));
    
    dealCounts.forEach(({ name, count }) => {
      console.log(`   ${name}: ${count} deals`);
    });
    
    // Check if counts are similar (within 10% difference)
    const maxCount = Math.max(...dealCounts.map(d => d.count));
    const minCount = Math.min(...dealCounts.map(d => d.count));
    const difference = maxCount - minCount;
    const percentDiff = maxCount > 0 ? (difference / maxCount) * 100 : 0;
    
    if (percentDiff <= 10) {
      console.log(`✅ Consistência: Diferença de ${difference} deals (${percentDiff.toFixed(1)}%) - Aceitável`);
    } else {
      console.log(`⚠️  Consistência: Diferença de ${difference} deals (${percentDiff.toFixed(1)}%) - Verificar`);
    }
  }
  
  // Performance improvement calculation
  if (cacheResult && apiResult) {
    const improvement = ((apiResult.responseTime - cacheResult.responseTime) / apiResult.responseTime) * 100;
    console.log(`\n🚀 Melhoria de Performance: ${improvement.toFixed(1)}% mais rápido com cache`);
  }
}

// Main test function
async function runTests() {
  try {
    // Test health endpoint
    const healthResult = await testHealthEndpoint();
    
    // Test all endpoints
    const cacheResult = await testCacheEndpoint();
    const apiResult = await testOriginalEndpoint();
    const newResult = await testNewEndpoint();
    
    // Compare results
    compareResults(cacheResult, apiResult, newResult);
    
    // Summary
    console.log('\n📋 Resumo dos Testes:');
    
    if (healthResult) {
      console.log(`   Status do sistema: ${healthResult.status}`);
    }
    
    const successfulTests = [cacheResult, apiResult, newResult].filter(r => r !== null).length;
    console.log(`   Testes bem-sucedidos: ${successfulTests}/3`);
    
    if (cacheResult && cacheResult.responseTime < 2000) {
      console.log('   ✅ Performance do cache: Excelente (<2s)');
    } else if (cacheResult) {
      console.log('   ⚠️  Performance do cache: Pode melhorar');
    }
    
    console.log('\n🎉 Testes concluídos!');
    
  } catch (error) {
    console.error('❌ Erro durante os testes:', error.message);
    process.exit(1);
  }
}

// Run the tests
runTests();
