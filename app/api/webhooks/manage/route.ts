// =====================================================
// GERENCIAMENTO DE WEBHOOKS
// =====================================================
// API para registrar, listar, atualizar e deletar webhooks

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { NuvemshopWebhookManager } from "@/lib/nuvemshop/webhook-manager";
import { NuvemshopWebhookEvent } from "@/types/webhooks";

// GET - Listar webhooks registrados
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();

    // Verificar autenticação
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const includeRemote = searchParams.get("include_remote") === "true";

    // Buscar webhooks locais
    const { data: localWebhooks, error: localError } = await supabase
      .from("nuvemshop_webhooks")
      .select("*")
      .order("created_at", { ascending: false });

    if (localError) {
      throw new Error(`Failed to fetch local webhooks: ${localError.message}`);
    }

    let remoteWebhooks = null;
    if (includeRemote) {
      try {
        const manager = new NuvemshopWebhookManager();
        remoteWebhooks = await manager.listWebhooks();
      } catch (error) {
        console.error("Failed to fetch remote webhooks:", error);
        // Não falhar a requisição se não conseguir buscar remotos
      }
    }

    // Buscar estatísticas recentes
    const { data: stats } = await supabase
      .from("nuvemshop_webhook_stats")
      .select("*")
      .gte(
        "date",
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0]
      )
      .order("date", { ascending: false });

    return NextResponse.json({
      success: true,
      data: {
        local_webhooks: localWebhooks || [],
        remote_webhooks: remoteWebhooks,
        recent_stats: stats || [],
        total_local: localWebhooks?.length || 0,
        active_local:
          localWebhooks?.filter((w) => w.status === "active").length || 0,
      },
    });
  } catch (error) {
    console.error("Failed to list webhooks:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// POST - Registrar novo webhook
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();

    // Verificar autenticação
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { event, description } = body;

    if (!event) {
      return NextResponse.json(
        {
          success: false,
          error: "Event is required",
        },
        { status: 400 }
      );
    }

    // Validar evento
    const validEvents: NuvemshopWebhookEvent[] = [
      "order/created",
      "order/updated",
      "order/paid",
      "order/cancelled",
      "product/created",
      "product/updated",
      "product/deleted",
      "category/created",
      "category/updated",
      "category/deleted",
      // Note: Coupon events don't exist in NuvemShop API
      // Coupon data is synced from order webhooks instead
    ];

    if (!validEvents.includes(event)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid event. Valid events: ${validEvents.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Verificar se já existe
    const { data: existing } = await supabase
      .from("nuvemshop_webhooks")
      .select("*")
      .eq("event", event)
      .eq("is_registered", true)
      .single();

    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: `Webhook for event '${event}' already exists`,
          existing_webhook: existing,
        },
        { status: 409 }
      );
    }

    // Registrar webhook
    const manager = new NuvemshopWebhookManager();
    const result = await manager.registerWebhook(event, description);

    return NextResponse.json({
      success: true,
      message: "Webhook registered successfully",
      data: result,
    });
  } catch (error) {
    console.error("Failed to register webhook:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// PUT - Sincronizar webhooks
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();

    // Verificar autenticação
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    const manager = new NuvemshopWebhookManager();

    if (action === "sync") {
      // Sincronizar webhooks entre Nuvemshop e banco local
      const result = await manager.syncWebhooks();

      return NextResponse.json({
        success: true,
        message: "Webhooks synchronized successfully",
        data: result,
      });
    } else if (action === "setup_essential") {
      // Registrar webhooks essenciais
      const result = await manager.registerEssentialWebhooks();

      return NextResponse.json({
        success: true,
        message: "Essential webhooks setup completed",
        data: result,
      });
    } else if (action === "health_check") {
      // Verificar saúde dos webhooks
      const result = await manager.checkWebhookHealth();

      return NextResponse.json({
        success: true,
        message: "Webhook health check completed",
        data: result,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid action. Valid actions: sync, setup_essential, health_check",
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Failed to perform webhook action:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// DELETE - Deletar webhook
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();

    // Verificar autenticação
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const webhookId = searchParams.get("webhook_id");
    const localId = searchParams.get("local_id");

    if (!webhookId && !localId) {
      return NextResponse.json(
        {
          success: false,
          error: "webhook_id or local_id is required",
        },
        { status: 400 }
      );
    }

    const manager = new NuvemshopWebhookManager();

    if (webhookId) {
      // Deletar webhook do Nuvemshop
      await manager.deleteWebhook(webhookId);
    } else if (localId) {
      // Deletar apenas do banco local
      const { error } = await supabase
        .from("nuvemshop_webhooks")
        .delete()
        .eq("id", localId);

      if (error) {
        throw new Error(`Failed to delete local webhook: ${error.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Webhook deleted successfully",
    });
  } catch (error) {
    console.error("Failed to delete webhook:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
