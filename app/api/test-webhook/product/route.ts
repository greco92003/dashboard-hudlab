// =====================================================
// ENDPOINT DE TESTE PARA WEBHOOK DE PRODUTO
// =====================================================
// Use este endpoint para testar o processamento de webhook sem depender do Nuvemshop

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { NuvemshopWebhookProcessor } from "@/lib/nuvemshop/webhook-processor";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const processor = new NuvemshopWebhookProcessor();

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    console.log("🧪 TEST WEBHOOK: Starting product webhook test");

    const body = await request.json();
    const { product_id, event = "product/updated" } = body;

    if (!product_id) {
      return NextResponse.json(
        { error: "product_id is required" },
        { status: 400 }
      );
    }

    console.log(`🧪 TEST WEBHOOK: Testing ${event} for product ${product_id}`);

    // Criar payload simulado
    const payload = {
      id: parseInt(product_id),
      store_id: 6400602, // ID da sua loja
      event,
    };

    // Criar log do webhook de teste
    const { data: webhookLog, error: logError } = await supabase
      .from("nuvemshop_webhook_logs")
      .insert({
        event,
        store_id: payload.store_id.toString(),
        resource_id: product_id,
        status: "received",
        headers: { "x-test": "true" },
        payload,
        hmac_signature: "test-signature",
        hmac_verified: true,
        received_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (logError) {
      console.error("Failed to create test webhook log:", logError);
      return NextResponse.json(
        { error: "Failed to create webhook log" },
        { status: 500 }
      );
    }

    console.log(`🧪 TEST WEBHOOK: Created log with ID ${webhookLog.id}`);

    // Processar webhook usando o mesmo processor
    const result = await processor.processWebhook(
      event as any,
      payload,
      webhookLog.id
    );

    const totalTime = Date.now() - startTime;

    if (result.success) {
      console.log(`✅ TEST WEBHOOK: Processed successfully in ${totalTime}ms`);

      return NextResponse.json({
        success: true,
        message: "Test webhook processed successfully",
        product_id,
        event,
        processing_time_ms: totalTime,
        processed_data: result.processed_data,
      });
    } else {
      console.error(`❌ TEST WEBHOOK: Failed - ${result.error_message}`);

      return NextResponse.json(
        {
          success: false,
          error: result.error_message,
          product_id,
          event,
          should_retry: result.should_retry,
          processing_time_ms: totalTime,
        },
        { status: result.should_retry ? 500 : 422 }
      );
    }
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error("🧪 TEST WEBHOOK: Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        processing_time_ms: totalTime,
      },
      { status: 500 }
    );
  }
}

// GET - Endpoint para verificação de saúde
export async function GET() {
  return NextResponse.json({
    status: "healthy",
    endpoint: "test-webhook/product",
    description: "Test endpoint for product webhooks",
    usage: "POST with { product_id: '123', event?: 'product/updated' }",
    timestamp: new Date().toISOString(),
  });
}
