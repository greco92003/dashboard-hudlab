import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerForSync } from "@/lib/supabase/server";
import { NuvemshopWebhookProcessor } from "@/lib/nuvemshop/webhook-processor";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerForSync();
    const { logId } = await request.json();

    if (!logId) {
      return NextResponse.json(
        { success: false, error: "Log ID is required" },
        { status: 400 }
      );
    }

    // Buscar o log do webhook
    const { data: webhookLog, error: logError } = await supabase
      .from("nuvemshop_webhook_logs")
      .select("*")
      .eq("id", logId)
      .single();

    if (logError || !webhookLog) {
      return NextResponse.json(
        { success: false, error: "Webhook log not found" },
        { status: 404 }
      );
    }

    // Verificar se o webhook pode ser retentado
    if (webhookLog.status !== "failed") {
      return NextResponse.json(
        {
          success: false,
          error: "Only failed webhooks can be retried",
        },
        { status: 400 }
      );
    }

    // Incrementar contador de retry
    const newRetryCount = (webhookLog.retry_count || 0) + 1;

    // Limitar número de retries
    if (newRetryCount > 5) {
      return NextResponse.json(
        {
          success: false,
          error: "Maximum retry attempts exceeded (5)",
        },
        { status: 400 }
      );
    }

    console.log(`🔄 Retrying webhook ${logId} (attempt ${newRetryCount})`);

    // Atualizar status para processing
    await supabase
      .from("nuvemshop_webhook_logs")
      .update({
        status: "processing",
        retry_count: newRetryCount,
        processing_started_at: new Date().toISOString(),
        error_message: null,
        error_details: null,
      })
      .eq("id", logId);

    // Processar webhook novamente
    const processor = new NuvemshopWebhookProcessor();
    const result = await processor.processWebhook(
      webhookLog.event,
      webhookLog.payload,
      logId
    );

    if (result.success) {
      console.log(`✅ Webhook retry successful for ${logId}`);

      return NextResponse.json({
        success: true,
        message: "Webhook retried successfully",
        log_id: logId,
        retry_count: newRetryCount,
        processing_time_ms: result.processing_time_ms,
      });
    } else {
      console.error(
        `❌ Webhook retry failed for ${logId}: ${result.error_message}`
      );

      return NextResponse.json(
        {
          success: false,
          error: result.error_message,
          log_id: logId,
          retry_count: newRetryCount,
          should_retry: result.should_retry,
        },
        { status: result.should_retry ? 500 : 422 }
      );
    }
  } catch (error) {
    console.error("Failed to retry webhook:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Endpoint para retry em lote de webhooks falhados
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerForSync();
    const { searchParams } = new URL(request.url);

    const event = searchParams.get("event");
    const resourceId = searchParams.get("resource_id");
    const limit = parseInt(searchParams.get("limit") || "10");

    // Buscar webhooks falhados para retry
    let query = supabase
      .from("nuvemshop_webhook_logs")
      .select("id, event, resource_id, retry_count")
      .eq("status", "failed")
      .lt("retry_count", 5)
      .order("received_at", { ascending: false })
      .limit(limit);

    if (event) query = query.eq("event", event);
    if (resourceId) query = query.eq("resource_id", resourceId);

    const { data: failedLogs, error: queryError } = await query;

    if (queryError) {
      throw new Error(`Failed to query failed webhooks: ${queryError.message}`);
    }

    if (!failedLogs || failedLogs.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No failed webhooks found to retry",
        retried_count: 0,
      });
    }

    console.log(`🔄 Starting batch retry for ${failedLogs.length} webhooks`);

    const processor = new NuvemshopWebhookProcessor();
    const results = [];

    // Processar cada webhook com delay para evitar sobrecarga
    for (const log of failedLogs) {
      try {
        // Atualizar status para processing
        await supabase
          .from("nuvemshop_webhook_logs")
          .update({
            status: "processing",
            retry_count: (log.retry_count || 0) + 1,
            processing_started_at: new Date().toISOString(),
            error_message: null,
            error_details: null,
          })
          .eq("id", log.id);

        // Buscar payload completo
        const { data: fullLog } = await supabase
          .from("nuvemshop_webhook_logs")
          .select("event, payload")
          .eq("id", log.id)
          .single();

        if (fullLog) {
          const result = await processor.processWebhook(
            fullLog.event,
            fullLog.payload,
            log.id
          );

          results.push({
            log_id: log.id,
            event: log.event,
            resource_id: log.resource_id,
            success: result.success,
            error: result.success ? null : result.error_message,
          });
        }

        // Delay de 100ms entre processamentos
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Failed to retry webhook ${log.id}:`, error);
        results.push({
          log_id: log.id,
          event: log.event,
          resource_id: log.resource_id,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.length - successCount;

    console.log(
      `✅ Batch retry completed: ${successCount} success, ${failureCount} failed`
    );

    return NextResponse.json({
      success: true,
      message: `Batch retry completed`,
      total_processed: results.length,
      success_count: successCount,
      failure_count: failureCount,
      results,
    });
  } catch (error) {
    console.error("Failed to batch retry webhooks:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
