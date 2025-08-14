#!/usr/bin/env node

// =====================================================
// SCRIPT DE TESTE PARA WEBHOOK DE PRODUTO
// =====================================================
// Execute este script para testar o processamento de webhook

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

async function testProductWebhook(productId, event = 'product/updated') {
  console.log(`🧪 Testing webhook for product ${productId} with event ${event}`);
  
  try {
    const response = await fetch(`${BASE_URL}/api/test-webhook/product`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        product_id: productId,
        event: event,
      }),
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Test webhook successful!');
      console.log('📊 Result:', JSON.stringify(result, null, 2));
    } else {
      console.log('❌ Test webhook failed!');
      console.log('📊 Error:', JSON.stringify(result, null, 2));
    }
    
    return result;
  } catch (error) {
    console.error('🚨 Test webhook error:', error);
    return { success: false, error: error.message };
  }
}

// Função principal
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node scripts/test-webhook.js <product_id> [event]');
    console.log('Example: node scripts/test-webhook.js 282148507 product/updated');
    process.exit(1);
  }
  
  const productId = args[0];
  const event = args[1] || 'product/updated';
  
  console.log('🚀 Starting webhook test...');
  console.log(`📦 Product ID: ${productId}`);
  console.log(`🎯 Event: ${event}`);
  console.log(`🌐 Base URL: ${BASE_URL}`);
  console.log('');
  
  await testProductWebhook(productId, event);
}

// Executar se chamado diretamente
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testProductWebhook };
