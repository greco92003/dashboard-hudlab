// =====================================================
// ENDPOINT GENÉRICO PARA WEBHOOKS NUVEMSHOP
// =====================================================
// Recebe e processa todos os tipos de webhooks do Nuvemshop

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { secureWebhookMiddleware } from "@/lib/nuvemshop/webhook-security";
import { NuvemshopWebhookProcessor } from "@/lib/nuvemshop/webhook-processor";
import { NuvemshopWebhookEvent } from "@/types/webhooks";

// Cliente Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Instância do processador
const processor = new NuvemshopWebhookProcessor();

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    console.log("🔔 Webhook received from Nuvemshop");

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
    const event = payload.event as NuvemshopWebhookEvent;
    const storeId = payload.store_id.toString();
    const resourceId = payload.id?.toString() || "unknown";

    console.log(`📨 Processing webhook: ${event} for resource ${resourceId}`);

    // 2. Criar log do webhook
    const { data: webhookLog, error: logError } = await supabase
      .from("nuvemshop_webhook_logs")
      .insert({
        event,
        store_id: storeId,
        resource_id: resourceId,
        status: "received",
        headers,
        payload,
        hmac_signature: headers["x-linkedstore-hmac-sha256"] || null,
        hmac_verified: true, // Já validado no middleware de segurança
        received_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (logError) {
      console.error("Failed to create webhook log:", logError);
      return NextResponse.json(
        { error: "Internal Server Error", message: "Failed to log webhook" },
        { status: 500 }
      );
    }

    const logId = webhookLog.id;

    // 3. Atualizar status para processando
    await supabase
      .from("nuvemshop_webhook_logs")
      .update({
        status: "processing",
        processing_started_at: new Date().toISOString(),
      })
      .eq("id", logId);

    // 4. Buscar webhook registrado correspondente
    const { data: registeredWebhook } = await supabase
      .from("nuvemshop_webhooks")
      .select("id")
      .eq("event", event)
      .eq("is_registered", true)
      .single();

    if (registeredWebhook) {
      // Atualizar último recebimento
      await supabase
        .from("nuvemshop_webhooks")
        .update({
          last_received_at: new Date().toISOString(),
          error_count: 0, // Reset error count on successful receipt
        })
        .eq("id", registeredWebhook.id);

      // Associar log ao webhook
      await supabase
        .from("nuvemshop_webhook_logs")
        .update({ webhook_id: registeredWebhook.id })
        .eq("id", logId);
    }

    // 5. Processar webhook
    const result = await processor.processWebhook(event, payload, logId);

    const totalTime = Date.now() - startTime;

    if (result.success) {
      console.log(`✅ Webhook processed successfully in ${totalTime}ms`);
      
      return NextResponse.json({
        success: true,
        message: "Webhook processed successfully",
        event,
        resource_id: resourceId,
        processing_time_ms: totalTime,
        log_id: logId,
      });
    } else {
      console.error(`❌ Webhook processing failed: ${result.error_message}`);
      
      // Se deve tentar novamente, retornar 500 para que o Nuvemshop reenvie
      const statusCode = result.should_retry ? 500 : 422;
      
      return NextResponse.json({
        success: false,
        error: result.error_message,
        event,
        resource_id: resourceId,
        should_retry: result.should_retry,
        processing_time_ms: totalTime,
        log_id: logId,
      }, { status: statusCode });
    }

  } catch (error) {
    const totalTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    console.error("❌ Webhook endpoint error:", error);

    return NextResponse.json({
      success: false,
      error: "Internal server error",
      message: errorMessage,
      processing_time_ms: totalTime,
    }, { status: 500 });
  }
}

// Endpoint para verificação de saúde
export async function GET() {
  try {
    // Verificar últimos webhooks recebidos
    const { data: recentLogs, error } = await supabase
      .from("nuvemshop_webhook_logs")
      .select("event, status, received_at")
      .order("received_at", { ascending: false })
      .limit(10);

    if (error) {
      throw error;
    }

    // Estatísticas básicas
    const { data: stats } = await supabase
      .from("nuvemshop_webhook_stats")
      .select("*")
      .eq("date", new Date().toISOString().split("T")[0])
      .order("total_received", { ascending: false })
      .limit(5);

    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      recent_webhooks: recentLogs?.length || 0,
      recent_logs: recentLogs || [],
      today_stats: stats || [],
    });

  } catch (error) {
    console.error("Health check failed:", error);
    
    return NextResponse.json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
}

// Método OPTIONS para CORS (se necessário)
export async function OPTIONS() {
  return NextResponse.json({}, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-linkedstore-hmac-sha256",
    },
  });
}
