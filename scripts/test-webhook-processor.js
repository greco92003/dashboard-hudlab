#!/usr/bin/env node

// Test the webhook processor directly to debug the issue
require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testWebhookProcessor() {
  console.log('🔧 Testing Webhook Processor Directly\n');

  try {
    // Test with a different product ID to avoid conflicts
    const testProductId = '282961756'; // Another product from the logs
    
    console.log(`1. Testing webhook processor with product ID: ${testProductId}`);
    
    // First, delete the product from database if it exists to test creation
    console.log('2. Cleaning up existing product...');
    await supabase
      .from('nuvemshop_products')
      .delete()
      .eq('product_id', testProductId);
    
    // Create a webhook log entry
    console.log('3. Creating webhook log entry...');
    const { data: webhookLog, error: logError } = await supabase
      .from('nuvemshop_webhook_logs')
      .insert({
        event: 'product/created',
        store_id: process.env.NUVEMSHOP_STORE_ID || '6400602',
        resource_id: testProductId,
        status: 'processing',
        headers: { 'test': 'true' },
        payload: {
          id: parseInt(testProductId),
          event: 'product/created',
          store_id: parseInt(process.env.NUVEMSHOP_STORE_ID || '6400602')
        },
        hmac_signature: 'test-signature',
        hmac_verified: true,
        processing_started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (logError) {
      console.error('❌ Failed to create webhook log:', logError);
      return;
    }

    console.log('✅ Webhook log created:', webhookLog.id);

    // Now test the webhook processor endpoint
    console.log('4. Testing webhook processor endpoint...');
    
    const response = await fetch('http://localhost:3000/api/test-webhook/product', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event: 'product/created',
        product_id: testProductId
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Webhook processor test successful:', result);
      
      // Check if product was created
      console.log('5. Checking if product was created in database...');
      
      const { data: product, error: productError } = await supabase
        .from('nuvemshop_products')
        .select('product_id, name_pt, brand, sync_status')
        .eq('product_id', testProductId)
        .single();

      if (productError) {
        console.error('❌ Product not found in database:', productError);
      } else {
        console.log('✅ Product found in database:', product);
      }
      
      // Check webhook log status
      console.log('6. Checking webhook log status...');
      
      const { data: updatedLog, error: logCheckError } = await supabase
        .from('nuvemshop_webhook_logs')
        .select('status, error_message, result_data')
        .eq('id', webhookLog.id)
        .single();

      if (logCheckError) {
        console.error('❌ Error checking log:', logCheckError);
      } else {
        console.log('✅ Webhook log status:', updatedLog);
      }
      
    } else {
      console.error('❌ Webhook processor test failed:', response.status, await response.text());
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testWebhookProcessor();
