// =====================================================
// HOOK PARA GERENCIAR WEBHOOKS
// =====================================================
// Hook React para gerenciar webhooks do Nuvemshop

"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  NuvemshopWebhook,
  NuvemshopWebhookEvent,
  NuvemshopWebhookLog,
  WebhookFilters,
  WebhookLogFilters,
} from "@/types/webhooks";

interface WebhookManagerState {
  webhooks: NuvemshopWebhook[];
  logs: NuvemshopWebhookLog[];
  stats: any[];
  loading: boolean;
  error: string | null;
}

interface WebhookManagerActions {
  // Webhook management
  listWebhooks: (includeRemote?: boolean) => Promise<void>;
  registerWebhook: (
    event: NuvemshopWebhookEvent,
    description?: string
  ) => Promise<boolean>;
  deleteWebhook: (webhookId: string, isLocal?: boolean) => Promise<boolean>;
  syncWebhooks: () => Promise<boolean>;
  setupEssentialWebhooks: () => Promise<boolean>;
  checkWebhookHealth: () => Promise<any>;

  // Log management
  listLogs: (filters?: WebhookLogFilters) => Promise<void>;
  retryWebhook: (logId: string) => Promise<boolean>;
  retryFailedWebhooks: (event?: string, limit?: number) => Promise<boolean>;
  markWebhookIgnored: (logId: string) => Promise<boolean>;
  cleanupOldLogs: (days?: number) => Promise<boolean>;

  // Utility
  refreshData: () => Promise<void>;
  clearError: () => void;
}

export function useWebhookManager(): WebhookManagerState &
  WebhookManagerActions {
  const [state, setState] = useState<WebhookManagerState>({
    webhooks: [],
    logs: [],
    stats: [],
    loading: false,
    error: null,
  });

  // Listar webhooks
  const listWebhooks = async (includeRemote = false) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const params = new URLSearchParams();
      if (includeRemote) params.append("include_remote", "true");

      const response = await fetch(`/api/webhooks/manage?${params}`);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error);
      }

      setState((prev) => ({
        ...prev,
        webhooks: result.data.local_webhooks,
        stats: result.data.recent_stats,
        loading: false,
      }));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to list webhooks";
      setState((prev) => ({ ...prev, error: errorMessage, loading: false }));
      toast.error(errorMessage);
    }
  };

  // Registrar novo webhook
  const registerWebhook = async (
    event: NuvemshopWebhookEvent,
    description?: string
  ): Promise<boolean> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await fetch("/api/webhooks/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, description }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error);
      }

      toast.success(`Webhook para ${event} registrado com sucesso!`);
      await listWebhooks(); // Refresh list
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to register webhook";
      setState((prev) => ({ ...prev, error: errorMessage, loading: false }));
      toast.error(errorMessage);
      return false;
    }
  };

  // Deletar webhook
  const deleteWebhook = async (
    webhookId: string,
    isLocal = false
  ): Promise<boolean> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const params = new URLSearchParams();
      if (isLocal) {
        params.append("local_id", webhookId);
      } else {
        params.append("webhook_id", webhookId);
      }

      const response = await fetch(`/api/webhooks/manage?${params}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error);
      }

      toast.success("Webhook deletado com sucesso!");
      await listWebhooks(); // Refresh list
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to delete webhook";
      setState((prev) => ({ ...prev, error: errorMessage, loading: false }));
      toast.error(errorMessage);
      return false;
    }
  };

  // Sincronizar webhooks
  const syncWebhooks = async (): Promise<boolean> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await fetch("/api/webhooks/manage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync" }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error);
      }

      toast.success(
        `Sincronização concluída: ${result.data.synced} webhooks sincronizados`
      );
      await listWebhooks(); // Refresh list
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to sync webhooks";
      setState((prev) => ({ ...prev, error: errorMessage, loading: false }));
      toast.error(errorMessage);
      return false;
    }
  };

  // Configurar webhooks essenciais
  const setupEssentialWebhooks = async (): Promise<boolean> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await fetch("/api/webhooks/manage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup_essential" }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error);
      }

      toast.success(
        `Webhooks essenciais configurados: ${result.data.registered} registrados`
      );
      await listWebhooks(); // Refresh list
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to setup essential webhooks";
      setState((prev) => ({ ...prev, error: errorMessage, loading: false }));
      toast.error(errorMessage);
      return false;
    }
  };

  // Verificar saúde dos webhooks
  const checkWebhookHealth = async (): Promise<any> => {
    try {
      const response = await fetch("/api/webhooks/manage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "health_check" }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to check webhook health";
      toast.error(errorMessage);
      throw error;
    }
  };

  // Listar logs
  const listLogs = async (filters?: WebhookLogFilters) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const params = new URLSearchParams();
      if (filters?.event) params.append("event", filters.event);
      if (filters?.status) params.append("status", filters.status);
      if (filters?.store_id) params.append("store_id", filters.store_id);
      if (filters?.resource_id)
        params.append("resource_id", filters.resource_id);
      if (filters?.date_from) params.append("date_from", filters.date_from);
      if (filters?.date_to) params.append("date_to", filters.date_to);

      const response = await fetch(`/api/webhooks/logs?${params}`);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error);
      }

      setState((prev) => ({
        ...prev,
        logs: result.data.logs,
        stats: result.data.today_stats,
        loading: false,
      }));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to list webhook logs";
      setState((prev) => ({ ...prev, error: errorMessage, loading: false }));
      toast.error(errorMessage);
    }
  };

  // Tentar novamente webhook
  const retryWebhook = async (logId: string): Promise<boolean> => {
    setState((prev) => ({ ...prev, loading: true }));

    try {
      const response = await fetch("/api/webhooks/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logId }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error);
      }

      toast.success(
        `Webhook processado novamente com sucesso (tentativa ${result.retry_count})`
      );
      await listLogs(); // Refresh logs
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to retry webhook";
      toast.error(errorMessage);
      return false;
    } finally {
      setState((prev) => ({ ...prev, loading: false }));
    }
  };

  // Tentar novamente webhooks falhados em lote
  const retryFailedWebhooks = async (
    event?: string,
    limit = 10
  ): Promise<boolean> => {
    setState((prev) => ({ ...prev, loading: true }));

    try {
      const params = new URLSearchParams();
      if (event) params.append("event", event);
      params.append("limit", limit.toString());

      const response = await fetch(`/api/webhooks/retry?${params}`, {
        method: "PUT",
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error);
      }

      toast.success(
        `Retry em lote concluído: ${result.success_count} sucessos, ${result.failure_count} falhas`
      );
      await listLogs(); // Refresh logs
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to retry failed webhooks";
      toast.error(errorMessage);
      return false;
    } finally {
      setState((prev) => ({ ...prev, loading: false }));
    }
  };

  // Marcar webhook como ignorado
  const markWebhookIgnored = async (logId: string): Promise<boolean> => {
    try {
      const response = await fetch("/api/webhooks/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ log_id: logId, action: "mark_ignored" }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error);
      }

      toast.success("Webhook marcado como ignorado");
      await listLogs(); // Refresh logs
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to mark webhook as ignored";
      toast.error(errorMessage);
      return false;
    }
  };

  // Limpar logs antigos
  const cleanupOldLogs = async (days = 30): Promise<boolean> => {
    try {
      const response = await fetch(`/api/webhooks/logs?days=${days}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error);
      }

      toast.success(`Logs antigos removidos (${days} dias)`);
      await listLogs(); // Refresh logs
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to cleanup old logs";
      toast.error(errorMessage);
      return false;
    }
  };

  // Atualizar todos os dados
  const refreshData = async () => {
    await Promise.all([listWebhooks(), listLogs()]);
  };

  // Limpar erro
  const clearError = () => {
    setState((prev) => ({ ...prev, error: null }));
  };

  // Carregar dados iniciais
  useEffect(() => {
    refreshData();
  }, []);

  return {
    ...state,
    listWebhooks,
    registerWebhook,
    deleteWebhook,
    syncWebhooks,
    setupEssentialWebhooks,
    checkWebhookHealth,
    listLogs,
    retryWebhook,
    retryFailedWebhooks,
    markWebhookIgnored,
    cleanupOldLogs,
    refreshData,
    clearError,
  };
}
