// =====================================================
// WEBHOOK ESPECÍFICO: PRODUCT CREATED
// =====================================================
// Endpoint específico para webhooks de produtos criados

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
    console.log("🛍️ Product created webhook received");

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
    const productId = payload.id?.toString() || "unknown";

    console.log(`📦 Processing product created: ${productId}`);

    // Criar log específico para product/created
    const { data: webhookLog, error: logError } = await supabase
      .from("nuvemshop_webhook_logs")
      .insert({
        event: "product/created",
        store_id: payload.store_id.toString(),
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
      return NextResponse.json(
        { error: "Internal Server Error" },
        { status: 500 }
      );
    }

    // RESPOND IMMEDIATELY to NuvemShop (within 10 seconds requirement)
    const quickResponse = NextResponse.json({
      success: true,
      message: "Product created webhook received",
      product_id: productId,
      log_id: webhookLog.id,
      processing_time_ms: Date.now() - startTime,
    });

    // Process webhook asynchronously (non-blocking)
    setImmediate(async () => {
      try {
        console.log(`🔄 Starting async processing for product ${productId}`);

        // Update log status to processing
        await supabase
          .from("nuvemshop_webhook_logs")
          .update({
            status: "processing",
            processing_started_at: new Date().toISOString(),
          })
          .eq("id", webhookLog.id);

        const result = await processor.processWebhook(
          "product/created",
          payload,
          webhookLog.id
        );

        if (result.success) {
          console.log(
            `✅ Product created webhook processed successfully for ${productId}`
          );
        } else {
          console.error(
            `❌ Product created webhook failed for ${productId}: ${result.error_message}`
          );
        }
      } catch (error) {
        console.error(
          `❌ Async processing error for product ${productId}:`,
          error
        );

        // Update log with error
        await supabase
          .from("nuvemshop_webhook_logs")
          .update({
            status: "failed",
            error_message:
              error instanceof Error ? error.message : "Unknown error",
            processing_completed_at: new Date().toISOString(),
          })
          .eq("id", webhookLog.id);
      }
    });

    return quickResponse;
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error("❌ Product created webhook error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        processing_time_ms: totalTime,
      },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    status: "healthy",
    endpoint: "product/created",
    timestamp: new Date().toISOString(),
  });
}
