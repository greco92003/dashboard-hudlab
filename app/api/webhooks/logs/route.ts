// =====================================================
// LOGS DE WEBHOOKS
// =====================================================
// API para visualizar e gerenciar logs de webhooks

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

// GET - Listar logs de webhooks
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    
    // Verificar autenticação
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    
    // Parâmetros de filtro
    const event = searchParams.get("event");
    const status = searchParams.get("status");
    const storeId = searchParams.get("store_id");
    const resourceId = searchParams.get("resource_id");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    // Construir query
    let query = supabase
      .from("nuvemshop_webhook_logs")
      .select(`
        id, event, store_id, resource_id, status,
        processing_started_at, processing_completed_at, processing_duration_ms,
        hmac_verified, error_message, retry_count, received_at,
        nuvemshop_webhooks(event, description)
      `)
      .order("received_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Aplicar filtros
    if (event) query = query.eq("event", event);
    if (status) query = query.eq("status", status);
    if (storeId) query = query.eq("store_id", storeId);
    if (resourceId) query = query.eq("resource_id", resourceId);
    if (dateFrom) query = query.gte("received_at", dateFrom);
    if (dateTo) query = query.lte("received_at", dateTo);

    const { data: logs, error: logsError } = await query;

    if (logsError) {
      throw new Error(`Failed to fetch webhook logs: ${logsError.message}`);
    }

    // Buscar contagem total para paginação
    let countQuery = supabase
      .from("nuvemshop_webhook_logs")
      .select("id", { count: "exact", head: true });

    // Aplicar mesmos filtros para contagem
    if (event) countQuery = countQuery.eq("event", event);
    if (status) countQuery = countQuery.eq("status", status);
    if (storeId) countQuery = countQuery.eq("store_id", storeId);
    if (resourceId) countQuery = countQuery.eq("resource_id", resourceId);
    if (dateFrom) countQuery = countQuery.gte("received_at", dateFrom);
    if (dateTo) countQuery = countQuery.lte("received_at", dateTo);

    const { count, error: countError } = await countQuery;

    if (countError) {
      console.error("Failed to count webhook logs:", countError);
    }

    // Buscar estatísticas resumidas
    const { data: stats } = await supabase
      .from("nuvemshop_webhook_stats")
      .select("*")
      .eq("date", new Date().toISOString().split("T")[0])
      .order("total_received", { ascending: false });

    return NextResponse.json({
      success: true,
      data: {
        logs: logs || [],
        pagination: {
          total: count || 0,
          limit,
          offset,
          has_more: (count || 0) > offset + limit,
        },
        today_stats: stats || [],
      },
    });

  } catch (error) {
    console.error("Failed to fetch webhook logs:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
}

// POST - Reprocessar webhook
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    
    // Verificar autenticação
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { log_id, action } = body;

    if (!log_id) {
      return NextResponse.json({
        success: false,
        error: "log_id is required",
      }, { status: 400 });
    }

    if (action === "retry") {
      // Buscar log do webhook
      const { data: log, error: logError } = await supabase
        .from("nuvemshop_webhook_logs")
        .select("*")
        .eq("id", log_id)
        .single();

      if (logError || !log) {
        return NextResponse.json({
          success: false,
          error: "Webhook log not found",
        }, { status: 404 });
      }

      // Verificar se pode ser reprocessado
      if (log.status === "processed") {
        return NextResponse.json({
          success: false,
          error: "Webhook already processed successfully",
        }, { status: 400 });
      }

      // Resetar status para reprocessamento
      const { error: updateError } = await supabase
        .from("nuvemshop_webhook_logs")
        .update({
          status: "received",
          processing_started_at: null,
          processing_completed_at: null,
          processing_duration_ms: null,
          error_message: null,
          error_details: null,
          retry_count: (log.retry_count || 0) + 1,
        })
        .eq("id", log_id);

      if (updateError) {
        throw new Error(`Failed to reset webhook log: ${updateError.message}`);
      }

      // Aqui você poderia adicionar lógica para reprocessar o webhook
      // Por exemplo, enviar para uma fila de processamento

      return NextResponse.json({
        success: true,
        message: "Webhook marked for retry",
        log_id,
      });

    } else if (action === "mark_ignored") {
      // Marcar como ignorado
      const { error: updateError } = await supabase
        .from("nuvemshop_webhook_logs")
        .update({
          status: "ignored",
          processing_completed_at: new Date().toISOString(),
          error_message: "Manually marked as ignored",
        })
        .eq("id", log_id);

      if (updateError) {
        throw new Error(`Failed to mark webhook as ignored: ${updateError.message}`);
      }

      return NextResponse.json({
        success: true,
        message: "Webhook marked as ignored",
        log_id,
      });

    } else {
      return NextResponse.json({
        success: false,
        error: "Invalid action. Valid actions: retry, mark_ignored",
      }, { status: 400 });
    }

  } catch (error) {
    console.error("Failed to process webhook action:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
}

// DELETE - Limpar logs antigos
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    
    // Verificar autenticação
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "30");

    if (days < 1 || days > 365) {
      return NextResponse.json({
        success: false,
        error: "Days must be between 1 and 365",
      }, { status: 400 });
    }

    // Deletar logs mais antigos que X dias
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const { error: deleteError } = await supabase
      .from("nuvemshop_webhook_logs")
      .delete()
      .lt("received_at", cutoffDate.toISOString());

    if (deleteError) {
      throw new Error(`Failed to delete old logs: ${deleteError.message}`);
    }

    return NextResponse.json({
      success: true,
      message: `Deleted webhook logs older than ${days} days`,
    });

  } catch (error) {
    console.error("Failed to delete old webhook logs:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
}
