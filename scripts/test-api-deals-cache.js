// Test what the API is returning for deal 14422
const fetch = require('node-fetch');

async function testAPI() {
  try {
    console.log('🔍 Testing /api/deals-cache endpoint...\n');
    
    const response = await fetch('http://localhost:3000/api/deals-cache?period=365', {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });
    
    const data = await response.json();
    
    // Find deal 14422
    const deal14422 = data.deals.find(d => d.deal_id === '14422');
    
    if (deal14422) {
      console.log('✅ Found deal 14422:');
      console.log('   Title:', deal14422.title);
      console.log('   Quantidade de Pares:', deal14422['quantidade-de-pares']);
      console.log('   Value:', deal14422.value);
      console.log('   Closing Date:', deal14422.closing_date);
      console.log('   Last Synced:', deal14422.last_synced_at);
    } else {
      console.log('❌ Deal 14422 not found in API response');
    }
    
    // Also check for deals with large quantidade-de-pares
    console.log('\n📊 Deals with suspicious quantidade-de-pares values:');
    const suspicious = data.deals.filter(d => {
      const qty = d['quantidade-de-pares'];
      return qty && qty.length > 5;
    }).slice(0, 5);
    
    suspicious.forEach(d => {
      console.log(`   ${d.deal_id}: "${d['quantidade-de-pares']}" - ${d.title}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testAPI();

