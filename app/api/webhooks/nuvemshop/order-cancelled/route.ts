// =====================================================
// WEBHOOK ESPECÍFICO: ORDER CANCELLED
// =====================================================
// Endpoint específico para webhooks de pedidos cancelados

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
    console.log("🔔 Order cancelled webhook received");

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
    const orderId = payload.id?.toString() || "unknown";
    const storeId = payload.store_id?.toString() || "unknown";

    console.log(`❌ Processing order cancelled: ${orderId} from store ${storeId}`);

    // 2. Criar log do webhook
    const { data: webhookLog, error: logError } = await supabase
      .from("nuvemshop_webhook_logs")
      .insert({
        event: "order/cancelled",
        store_id: storeId,
        resource_id: orderId,
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
    const result = await processor.processWebhook("order/cancelled", payload, webhookLog.id);

    const totalTime = Date.now() - startTime;

    if (result.success) {
      console.log(`✅ Order cancelled webhook processed in ${totalTime}ms`);
      
      return NextResponse.json({
        success: true,
        message: "Order cancelled webhook processed",
        order_id: orderId,
        processing_time_ms: totalTime,
      });
    } else {
      console.error(`❌ Order cancelled webhook failed: ${result.error_message}`);
      
      return NextResponse.json({
        success: false,
        error: result.error_message,
        order_id: orderId,
        should_retry: result.should_retry,
      }, { status: result.should_retry ? 500 : 422 });
    }

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error("Order cancelled webhook error:", error);
    
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
    endpoint: "order/cancelled",
    timestamp: new Date().toISOString(),
  });
}
