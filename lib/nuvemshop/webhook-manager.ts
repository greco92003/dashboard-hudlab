// =====================================================
// GERENCIADOR DE WEBHOOKS NUVEMSHOP
// =====================================================
// Utilitário para registrar, listar, atualizar e deletar webhooks via API

import { createClient } from "@supabase/supabase-js";
import {
  NuvemshopWebhookEvent,
  NuvemshopWebhookResponse,
  CreateWebhookRequest,
  UpdateWebhookRequest,
  NuvemshopWebhook,
} from "@/types/webhooks";

// Configuração da API do Nuvemshop
const NUVEMSHOP_API_BASE_URL = "https://api.nuvemshop.com.br/v1";

// Cliente Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Classe para gerenciar webhooks
export class NuvemshopWebhookManager {
  private accessToken: string;
  private userId: string;
  private baseUrl: string;

  constructor() {
    this.accessToken = process.env.NUVEMSHOP_ACCESS_TOKEN!;
    this.userId = process.env.NUVEMSHOP_USER_ID!;
    this.baseUrl = process.env.NEXT_PUBLIC_APP_URL!;

    if (!this.accessToken || !this.userId || !this.baseUrl) {
      throw new Error("Nuvemshop credentials or app URL not configured");
    }
  }

  // Fazer requisição autenticada para API do Nuvemshop
  private async makeRequest(endpoint: string, options: RequestInit = {}) {
    const url = `${NUVEMSHOP_API_BASE_URL}/${this.userId}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authentication: `bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        "User-Agent": "HudLab Dashboard (contato@hudlab.com.br)",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Nuvemshop API Error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  // Registrar um novo webhook no Nuvemshop
  async registerWebhook(
    event: NuvemshopWebhookEvent,
    description?: string
  ): Promise<NuvemshopWebhookResponse> {
    const webhookUrl = `${this.baseUrl}/api/webhooks/nuvemshop/${event.replace(
      "/",
      "-"
    )}`;

    console.log(`🔗 Registering webhook for event: ${event}`);
    console.log(`📍 Webhook URL: ${webhookUrl}`);

    try {
      // Registrar no Nuvemshop
      const response = await this.makeRequest("/webhooks", {
        method: "POST",
        body: JSON.stringify({
          event,
          url: webhookUrl,
        }),
      });

      console.log(`✅ Webhook registered successfully:`, response);

      // Salvar no banco de dados local
      const { data: webhook, error } = await supabase
        .from("nuvemshop_webhooks")
        .insert({
          webhook_id: response.id.toString(),
          event,
          url: webhookUrl,
          status: "active",
          is_registered: true,
          description,
          registered_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error("Error saving webhook to database:", error);
        // Tentar deletar o webhook do Nuvemshop se falhou salvar no banco
        try {
          await this.deleteWebhook(response.id.toString());
        } catch (deleteError) {
          console.error(
            "Failed to cleanup webhook from Nuvemshop:",
            deleteError
          );
        }
        throw new Error(`Failed to save webhook to database: ${error.message}`);
      }

      return response;
    } catch (error) {
      console.error(`❌ Failed to register webhook for ${event}:`, error);

      // Salvar erro no banco de dados
      await supabase.from("nuvemshop_webhooks").insert({
        event,
        url: webhookUrl,
        status: "error",
        is_registered: false,
        description,
        last_error: error instanceof Error ? error.message : "Unknown error",
        error_count: 1,
        last_error_at: new Date().toISOString(),
      });

      throw error;
    }
  }

  // Listar webhooks registrados no Nuvemshop
  async listWebhooks(): Promise<NuvemshopWebhookResponse[]> {
    try {
      const response = await this.makeRequest("/webhooks");
      return Array.isArray(response) ? response : [];
    } catch (error) {
      console.error("Failed to list webhooks:", error);
      throw error;
    }
  }

  // Deletar webhook do Nuvemshop
  async deleteWebhook(webhookId: string): Promise<void> {
    try {
      await this.makeRequest(`/webhooks/${webhookId}`, {
        method: "DELETE",
      });

      // Atualizar status no banco de dados
      await supabase
        .from("nuvemshop_webhooks")
        .update({
          status: "inactive",
          is_registered: false,
          updated_at: new Date().toISOString(),
        })
        .eq("webhook_id", webhookId);

      console.log(`✅ Webhook ${webhookId} deleted successfully`);
    } catch (error) {
      console.error(`❌ Failed to delete webhook ${webhookId}:`, error);
      throw error;
    }
  }

  // Atualizar webhook no Nuvemshop
  async updateWebhook(
    webhookId: string,
    updates: UpdateWebhookRequest
  ): Promise<NuvemshopWebhookResponse> {
    try {
      const response = await this.makeRequest(`/webhooks/${webhookId}`, {
        method: "PUT",
        body: JSON.stringify(updates),
      });

      // Atualizar no banco de dados
      await supabase
        .from("nuvemshop_webhooks")
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq("webhook_id", webhookId);

      console.log(`✅ Webhook ${webhookId} updated successfully`);
      return response;
    } catch (error) {
      console.error(`❌ Failed to update webhook ${webhookId}:`, error);
      throw error;
    }
  }

  // Sincronizar webhooks entre Nuvemshop e banco local
  async syncWebhooks(): Promise<{ synced: number; errors: number }> {
    let synced = 0;
    let errors = 0;

    try {
      // Buscar webhooks do Nuvemshop
      const remoteWebhooks = await this.listWebhooks();

      // Buscar webhooks do banco local
      const { data: localWebhooks, error } = await supabase
        .from("nuvemshop_webhooks")
        .select("*");

      if (error) {
        throw new Error(`Failed to fetch local webhooks: ${error.message}`);
      }

      // Criar mapa dos webhooks locais por webhook_id
      const localWebhookMap = new Map(
        localWebhooks?.map((w) => [w.webhook_id, w]) || []
      );

      // Processar webhooks remotos
      for (const remoteWebhook of remoteWebhooks) {
        try {
          const localWebhook = localWebhookMap.get(remoteWebhook.id.toString());

          if (localWebhook) {
            // Atualizar webhook existente
            await supabase
              .from("nuvemshop_webhooks")
              .update({
                event: remoteWebhook.event as NuvemshopWebhookEvent,
                url: remoteWebhook.url,
                status: "active",
                is_registered: true,
                updated_at: new Date().toISOString(),
              })
              .eq("webhook_id", remoteWebhook.id.toString());
          } else {
            // Criar novo webhook no banco local
            await supabase.from("nuvemshop_webhooks").insert({
              webhook_id: remoteWebhook.id.toString(),
              event: remoteWebhook.event as NuvemshopWebhookEvent,
              url: remoteWebhook.url,
              status: "active",
              is_registered: true,
              registered_at: remoteWebhook.created_at,
            });
          }

          synced++;
        } catch (error) {
          console.error(`Error syncing webhook ${remoteWebhook.id}:`, error);
          errors++;
        }
      }

      // Marcar webhooks locais que não existem mais no Nuvemshop como inativos
      const remoteWebhookIds = remoteWebhooks.map((w) => w.id.toString());
      const orphanedWebhooks =
        localWebhooks?.filter(
          (w) => w.webhook_id && !remoteWebhookIds.includes(w.webhook_id)
        ) || [];

      for (const orphanedWebhook of orphanedWebhooks) {
        try {
          await supabase
            .from("nuvemshop_webhooks")
            .update({
              status: "inactive",
              is_registered: false,
              updated_at: new Date().toISOString(),
            })
            .eq("id", orphanedWebhook.id);
        } catch (error) {
          console.error(
            `Error updating orphaned webhook ${orphanedWebhook.id}:`,
            error
          );
          errors++;
        }
      }

      console.log(
        `🔄 Webhook sync completed: ${synced} synced, ${errors} errors`
      );
      return { synced, errors };
    } catch (error) {
      console.error("Failed to sync webhooks:", error);
      throw error;
    }
  }

  // Registrar webhooks essenciais para o sistema
  async registerEssentialWebhooks(): Promise<{
    registered: number;
    errors: number;
  }> {
    const essentialEvents: NuvemshopWebhookEvent[] = [
      // Order events (vendas)
      "order/created",
      "order/updated",
      "order/paid",
      "order/cancelled",

      // Product events (produtos)
      "product/created",
      "product/updated",
      "product/deleted",

      // Note: Coupon events don't exist in NuvemShop API
      // Coupon data is synced from order webhooks instead
    ];

    let registered = 0;
    let errors = 0;

    for (const event of essentialEvents) {
      try {
        // Verificar se já existe
        const { data: existing } = await supabase
          .from("nuvemshop_webhooks")
          .select("*")
          .eq("event", event)
          .eq("is_registered", true)
          .single();

        if (!existing) {
          await this.registerWebhook(event, `Essential webhook for ${event}`);
          registered++;
          console.log(`✅ Registered essential webhook: ${event}`);
        } else {
          console.log(`ℹ️ Essential webhook already exists: ${event}`);
        }
      } catch (error) {
        console.error(
          `❌ Failed to register essential webhook ${event}:`,
          error
        );
        errors++;
      }
    }

    console.log(
      `🎯 Essential webhooks setup: ${registered} registered, ${errors} errors`
    );
    return { registered, errors };
  }

  // Verificar saúde dos webhooks
  async checkWebhookHealth(): Promise<{
    total: number;
    active: number;
    inactive: number;
    errors: number;
    last_received: string | null;
  }> {
    const { data: webhooks, error } = await supabase
      .from("nuvemshop_webhooks")
      .select("status, last_received_at");

    if (error) {
      throw new Error(`Failed to check webhook health: ${error.message}`);
    }

    const total = webhooks?.length || 0;
    const active = webhooks?.filter((w) => w.status === "active").length || 0;
    const inactive =
      webhooks?.filter((w) => w.status === "inactive").length || 0;
    const errors = webhooks?.filter((w) => w.status === "error").length || 0;

    const lastReceived =
      webhooks
        ?.map((w) => w.last_received_at)
        .filter(Boolean)
        .sort()
        .pop() || null;

    return {
      total,
      active,
      inactive,
      errors,
      last_received: lastReceived,
    };
  }
}
