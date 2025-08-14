// =====================================================
// WEBHOOK ESPECÍFICO: PRODUCT DELETED
// =====================================================
// Endpoint específico para webhooks de produtos deletados

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { secureWebhookMiddleware } from "@/lib/nuvemshop/webhook-security";
import { NuvemshopWebhookProcessor } from "@/lib/nuvemshop/webhook-processor";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const processor = new NuvemshopWebhookProcessor();

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    console.log("🔔 Product deleted webhook received");

    // 1. Validação de segurança
    const security = await secureWebhookMiddleware(request);
    
    if (!security.isValid) {
      console.error("❌ Security validation failed:", security.error);
      
      if (security.shouldBlock) {
        return NextResponse.json(
          { error: "Forbidden", message: security.error },
          { status: 403 }
        );
      }
      
      return NextResponse.json(
        { error: "Bad Request", message: security.error },
        { status: 400 }
      );
    }

    const { payload, headers } = security;
    const productId = payload.id?.toString() || "unknown";
    const storeId = payload.store_id?.toString() || "unknown";

    console.log(`🗑️ Processing product deleted: ${productId} from store ${storeId}`);

    // 2. Criar log do webhook
    const { data: webhookLog, error: logError } = await supabase
      .from("nuvemshop_webhook_logs")
      .insert({
        event: "product/deleted",
        store_id: storeId,
        resource_id: productId,
        status: "received",
        headers,
        payload,
        hmac_signature: headers["x-linkedstore-hmac-sha256"] || null,
        hmac_verified: true,
        received_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (logError) {
      console.error("Failed to create webhook log:", logError);
      return NextResponse.json({
        success: false,
        error: "Failed to log webhook",
      }, { status: 500 });
    }

    // Processar webhook
    const result = await processor.processWebhook("product/deleted", payload, webhookLog.id);

    const totalTime = Date.now() - startTime;

    if (result.success) {
      console.log(`✅ Product deleted webhook processed in ${totalTime}ms`);
      
      return NextResponse.json({
        success: true,
        message: "Product deleted webhook processed",
        product_id: productId,
        processing_time_ms: totalTime,
      });
    } else {
      console.error(`❌ Product deleted webhook failed: ${result.error_message}`);
      
      return NextResponse.json({
        success: false,
        error: result.error_message,
        product_id: productId,
        should_retry: result.should_retry,
      }, { status: result.should_retry ? 500 : 422 });
    }

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error("Product deleted webhook error:", error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      processing_time_ms: totalTime,
    }, { status: 500 });
  }
}

// Endpoint para verificação de saúde
export async function GET() {
  return NextResponse.json({
    status: "healthy",
    endpoint: "product/deleted",
    timestamp: new Date().toISOString(),
  });
}
