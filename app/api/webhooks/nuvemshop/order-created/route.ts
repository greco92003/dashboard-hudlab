// =====================================================
// WEBHOOK ESPECÍFICO: ORDER CREATED
// =====================================================
// Endpoint específico para webhooks de pedidos criados

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
    console.log("🔔 Order created webhook received");

    // Validação de segurança
    const security = await secureWebhookMiddleware(request);
    
    if (!security.isValid) {
      console.error("❌ Security validation failed:", security.error);
      return NextResponse.json(
        { error: "Forbidden", message: security.error },
        { status: security.shouldBlock ? 403 : 400 }
      );
    }

    const { payload, headers } = security;
    const orderId = payload.id?.toString() || "unknown";

    console.log(`📦 Processing order created: ${orderId}`);

    // Criar log específico para order/created
    const { data: webhookLog, error: logError } = await supabase
      .from("nuvemshop_webhook_logs")
      .insert({
        event: "order/created",
        store_id: payload.store_id.toString(),
        resource_id: orderId,
        status: "processing",
        headers,
        payload,
        hmac_signature: headers["x-linkedstore-hmac-sha256"] || null,
        hmac_verified: true,
        processing_started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (logError) {
      console.error("Failed to create webhook log:", logError);
      return NextResponse.json(
        { error: "Internal Server Error" },
        { status: 500 }
      );
    }

    // Processar webhook
    const result = await processor.processWebhook("order/created", payload, webhookLog.id);

    const totalTime = Date.now() - startTime;

    if (result.success) {
      console.log(`✅ Order created webhook processed in ${totalTime}ms`);
      
      return NextResponse.json({
        success: true,
        message: "Order created webhook processed",
        order_id: orderId,
        processing_time_ms: totalTime,
      });
    } else {
      console.error(`❌ Order created webhook failed: ${result.error_message}`);
      
      return NextResponse.json({
        success: false,
        error: result.error_message,
        order_id: orderId,
        should_retry: result.should_retry,
      }, { status: result.should_retry ? 500 : 422 });
    }

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error("❌ Order created webhook error:", error);

    return NextResponse.json({
      success: false,
      error: "Internal server error",
      processing_time_ms: totalTime,
    }, { status: 500 });
  }
}
