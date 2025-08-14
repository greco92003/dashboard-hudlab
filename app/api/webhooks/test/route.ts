// =====================================================
// ENDPOINT PARA TESTAR WEBHOOKS
// =====================================================
// Endpoint para simular webhooks do Nuvemshop para testes

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Payloads de exemplo para diferentes eventos
const SAMPLE_PAYLOADS = {
  "order/created": {
    store_id: parseInt(process.env.NUVEMSHOP_USER_ID || "123456"),
    event: "order/created",
    id: 12345,
    number: "0001",
    name: "Pedido de Teste #0001",
    contact_name: "Cliente Teste",
    total: "199.90",
    status: "open",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  "order/paid": {
    store_id: parseInt(process.env.NUVEMSHOP_USER_ID || "123456"),
    event: "order/paid",
    id: 12346,
    number: "0002",
    name: "Pedido Pago #0002",
    contact_name: "Cliente Teste 2",
    total: "299.90",
    status: "closed",
    payment_status: "paid",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  "product/created": {
    store_id: parseInt(process.env.NUVEMSHOP_USER_ID || "123456"),
    event: "product/created",
    id: 67890,
    name: { pt: "Produto de Teste" },
    handle: "produto-de-teste",
    published: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  "product/updated": {
    store_id: parseInt(process.env.NUVEMSHOP_USER_ID || "123456"),
    event: "product/updated",
    id: 67891,
    name: { pt: "Produto Atualizado" },
    handle: "produto-atualizado",
    published: true,
    created_at: new Date(Date.now() - 86400000).toISOString(), // 1 dia atrás
    updated_at: new Date().toISOString(),
  },
};

// POST - Simular webhook
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { event, custom_payload } = body;

    if (!event) {
      return NextResponse.json({
        success: false,
        error: "Event is required",
      }, { status: 400 });
    }

    // Usar payload customizado ou payload de exemplo
    let payload = custom_payload;
    if (!payload && SAMPLE_PAYLOADS[event as keyof typeof SAMPLE_PAYLOADS]) {
      payload = SAMPLE_PAYLOADS[event as keyof typeof SAMPLE_PAYLOADS];
    }

    if (!payload) {
      return NextResponse.json({
        success: false,
        error: `No sample payload available for event: ${event}`,
        available_events: Object.keys(SAMPLE_PAYLOADS),
      }, { status: 400 });
    }

    // Determinar URL do webhook baseado no evento
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const webhookUrl = `${baseUrl}/api/webhooks/nuvemshop/${event.replace("/", "-")}`;

    console.log(`🧪 Sending test webhook: ${event} to ${webhookUrl}`);

    // Enviar webhook para o endpoint
    const webhookResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Nuvemshop Test Webhook",
        "X-Test-Webhook": "true",
      },
      body: JSON.stringify(payload),
    });

    const webhookResult = await webhookResponse.text();
    let parsedResult;
    try {
      parsedResult = JSON.parse(webhookResult);
    } catch {
      parsedResult = { raw_response: webhookResult };
    }

    // Registrar teste no banco
    await supabase
      .from("nuvemshop_webhook_logs")
      .insert({
        event,
        store_id: payload.store_id?.toString() || "test",
        resource_id: payload.id?.toString() || "test",
        status: webhookResponse.ok ? "processed" : "failed",
        headers: { "x-test-webhook": "true" },
        payload,
        hmac_verified: true,
        result_data: parsedResult,
        error_message: webhookResponse.ok ? null : `HTTP ${webhookResponse.status}`,
        processing_duration_ms: 0,
        received_at: new Date().toISOString(),
      });

    return NextResponse.json({
      success: true,
      message: "Test webhook sent successfully",
      data: {
        event,
        webhook_url: webhookUrl,
        webhook_status: webhookResponse.status,
        webhook_response: parsedResult,
        payload_sent: payload,
      },
    });

  } catch (error) {
    console.error("Test webhook error:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
}

// GET - Listar eventos disponíveis para teste
export async function GET() {
  try {
    const events = Object.keys(SAMPLE_PAYLOADS);
    
    // Buscar estatísticas de testes recentes
    const { data: recentTests } = await supabase
      .from("nuvemshop_webhook_logs")
      .select("event, status, received_at")
      .contains("headers", { "x-test-webhook": "true" })
      .order("received_at", { ascending: false })
      .limit(10);

    return NextResponse.json({
      success: true,
      data: {
        available_events: events,
        sample_payloads: SAMPLE_PAYLOADS,
        recent_tests: recentTests || [],
        test_instructions: {
          "1": "Use POST /api/webhooks/test com { event: 'order/created' }",
          "2": "Ou forneça custom_payload para dados específicos",
          "3": "O webhook será enviado para o endpoint correspondente",
          "4": "Verifique os logs em /admin/webhooks para ver o resultado",
        },
      },
    });

  } catch (error) {
    console.error("Test webhook list error:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
}

// PUT - Testar todos os webhooks essenciais
export async function PUT() {
  try {
    const essentialEvents = ["order/created", "order/paid", "product/created"];
    const results = [];

    for (const event of essentialEvents) {
      try {
        const payload = SAMPLE_PAYLOADS[event as keyof typeof SAMPLE_PAYLOADS];
        if (!payload) continue;

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const webhookUrl = `${baseUrl}/api/webhooks/nuvemshop/${event.replace("/", "-")}`;

        const webhookResponse = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Nuvemshop Batch Test Webhook",
            "X-Test-Webhook": "true",
          },
          body: JSON.stringify(payload),
        });

        const webhookResult = await webhookResponse.text();
        let parsedResult;
        try {
          parsedResult = JSON.parse(webhookResult);
        } catch {
          parsedResult = { raw_response: webhookResult };
        }

        results.push({
          event,
          success: webhookResponse.ok,
          status: webhookResponse.status,
          response: parsedResult,
        });

        // Pequena pausa entre testes
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        results.push({
          event,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;

    return NextResponse.json({
      success: true,
      message: `Batch test completed: ${successCount}/${totalCount} successful`,
      data: {
        results,
        summary: {
          total: totalCount,
          successful: successCount,
          failed: totalCount - successCount,
        },
      },
    });

  } catch (error) {
    console.error("Batch test webhook error:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
}
