#!/usr/bin/env node

// Test script to verify product webhook functionality
require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testProductWebhook() {
  console.log('🧪 Testing Product Webhook Functionality...\n');

  try {
    // 1. Test webhook endpoint directly
    console.log('1. Testing webhook endpoint...');
    
    const testPayload = {
      id: 999999999,
      event: 'product/created',
      store_id: parseInt(process.env.NUVEMSHOP_STORE_ID || '6400602')
    };

    const response = await fetch('http://localhost:3000/api/test-webhook/product', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event: 'product/created',
        product_id: '999999999'
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Webhook endpoint test successful:', result);
    } else {
      console.log('❌ Webhook endpoint test failed:', response.status, await response.text());
    }

    // 2. Check recent webhook logs
    console.log('\n2. Checking recent webhook logs...');
    
    const { data: logs, error: logsError } = await supabase
      .from('nuvemshop_webhook_logs')
      .select('id, event, resource_id, status, error_message, created_at')
      .eq('event', 'product/created')
      .order('created_at', { ascending: false })
      .limit(5);

    if (logsError) {
      console.error('❌ Error fetching logs:', logsError);
    } else {
      console.log(`✅ Found ${logs.length} recent product/created webhooks:`);
      logs.forEach(log => {
        console.log(`   - ${log.resource_id}: ${log.status} (${log.created_at})`);
        if (log.error_message) {
          console.log(`     Error: ${log.error_message}`);
        }
      });
    }

    // 3. Check if products exist in database
    console.log('\n3. Checking if products exist in database...');
    
    if (logs && logs.length > 0) {
      const productIds = logs.map(log => log.resource_id);
      
      const { data: products, error: productsError } = await supabase
        .from('nuvemshop_products')
        .select('product_id, name_pt, brand, sync_status, created_at')
        .in('product_id', productIds);

      if (productsError) {
        console.error('❌ Error fetching products:', productsError);
      } else {
        console.log(`✅ Found ${products.length} products in database:`);
        products.forEach(product => {
          console.log(`   - ${product.product_id}: ${product.name_pt || 'No name'} (${product.sync_status})`);
        });

        // Check for missing products
        const foundIds = products.map(p => p.product_id);
        const missingIds = productIds.filter(id => !foundIds.includes(id));
        
        if (missingIds.length > 0) {
          console.log(`❌ Missing products in database: ${missingIds.join(', ')}`);
        }
      }
    }

    // 4. Test database timeout settings
    console.log('\n4. Checking database timeout settings...');
    
    const { data: timeoutData, error: timeoutError } = await supabase
      .rpc('get_timeout_settings');

    if (timeoutError) {
      console.log('ℹ️ Could not fetch timeout settings (this is normal)');
    } else {
      console.log('✅ Database timeout settings:', timeoutData);
    }

    console.log('\n🎯 Test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testProductWebhook();
