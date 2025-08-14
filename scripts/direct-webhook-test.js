#!/usr/bin/env node

// Direct test of the webhook processor without HTTP
require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Import the webhook processor directly
const { NuvemshopWebhookProcessor } = require('../lib/nuvemshop/webhook-processor.ts');

async function directWebhookTest() {
  console.log('🔧 Direct Webhook Processor Test\n');

  try {
    const processor = new NuvemshopWebhookProcessor();
    const testProductId = '282961756';
    
    console.log(`1. Testing with product ID: ${testProductId}`);
    
    // Clean up existing product
    console.log('2. Cleaning up existing product...');
    await supabase
      .from('nuvemshop_products')
      .delete()
      .eq('product_id', testProductId);
    
    // Create webhook log
    console.log('3. Creating webhook log...');
    const { data: webhookLog, error: logError } = await supabase
      .from('nuvemshop_webhook_logs')
      .insert({
        event: 'product/created',
        store_id: '6400602',
        resource_id: testProductId,
        status: 'processing',
        headers: { 'test': 'true' },
        payload: {
          id: parseInt(testProductId),
          event: 'product/created',
          store_id: 6400602
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

    // Test the processor directly
    console.log('4. Testing webhook processor...');
    
    const payload = {
      id: parseInt(testProductId),
      store_id: 6400602,
      event: 'product/created'
    };

    const result = await processor.processWebhook('product/created', payload, webhookLog.id);
    
    console.log('5. Processor result:', result);
    
    if (result.success) {
      console.log('✅ Webhook processed successfully!');
      
      // Check if product was created
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
    } else {
      console.error('❌ Webhook processing failed:', result.error_message);
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
directWebhookTest();
