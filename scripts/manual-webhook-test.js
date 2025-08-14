#!/usr/bin/env node

// Manual test to trigger a product webhook and debug the issue
require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function manualWebhookTest() {
  console.log('🔧 Manual Webhook Test - Debugging Product Creation Issue\n');

  try {
    // Test with a real product ID that we know exists
    const testProductId = '282994266'; // From the webhook logs
    
    console.log(`1. Testing with product ID: ${testProductId}`);
    
    // First, let's try to fetch the product directly from NuvemShop API
    console.log('2. Fetching product from NuvemShop API...');
    
    const nuvemshopUrl = `https://api.nuvemshop.com.br/v1/${process.env.NUVEMSHOP_USER_ID}/products/${testProductId}`;
    
    const apiResponse = await fetch(nuvemshopUrl, {
      headers: {
        'Authentication': `bearer ${process.env.NUVEMSHOP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'HudLab Dashboard Test Script'
      }
    });

    if (apiResponse.ok) {
      const productData = await apiResponse.json();
      console.log('✅ Product fetched from API:', {
        id: productData.id,
        name: productData.name,
        brand: productData.brand,
        published: productData.published
      });

      // Now let's try to save it directly to the database
      console.log('3. Attempting to save product to database...');
      
      const processedProduct = {
        product_id: productData.id.toString(),
        name: productData.name,
        name_pt: productData.name?.pt || productData.name?.en || productData.name || null,
        brand: productData.brand || null,
        description: productData.description?.pt || productData.description?.en || productData.description || null,
        handle: productData.handle || null,
        variants: productData.variants || null,
        images: productData.images || null,
        featured_image_id: productData.featured_image?.id?.toString() || null,
        featured_image_src: productData.featured_image?.src || null,
        published: productData.published || false,
        free_shipping: productData.free_shipping || false,
        seo_title: productData.seo_title || null,
        seo_description: productData.seo_description || null,
        tags: productData.tags || [],
        last_synced_at: new Date().toISOString(),
        api_updated_at: productData.updated_at ? new Date(productData.updated_at).toISOString() : null,
        sync_status: 'synced'
      };

      console.log('4. Processed product data:', {
        product_id: processedProduct.product_id,
        name_pt: processedProduct.name_pt,
        brand: processedProduct.brand,
        published: processedProduct.published
      });

      const { data, error } = await supabase
        .from('nuvemshop_products')
        .upsert(processedProduct, {
          onConflict: 'product_id',
          ignoreDuplicates: false,
        })
        .select('id, product_id, name_pt');

      if (error) {
        console.error('❌ Database error:', error);
        console.error('❌ Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
      } else {
        console.log('✅ Product saved successfully:', data);
        
        // Verify it's in the database
        const { data: verifyData, error: verifyError } = await supabase
          .from('nuvemshop_products')
          .select('product_id, name_pt, brand, sync_status')
          .eq('product_id', testProductId)
          .single();

        if (verifyError) {
          console.error('❌ Verification failed:', verifyError);
        } else {
          console.log('✅ Product verified in database:', verifyData);
        }
      }

    } else {
      console.error('❌ Failed to fetch product from API:', apiResponse.status, await apiResponse.text());
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
manualWebhookTest();
