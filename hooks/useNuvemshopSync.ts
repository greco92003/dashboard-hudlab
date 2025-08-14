"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";

interface SyncOptions {
  type: "orders" | "products" | "full";
  limit?: number;
  page?: number;
  status?: string;
  published?: string;
}

interface SyncStats {
  newRecords: number;
  updatedRecords: number;
  errorRecords: number;
  totalRecords: number;
  processedRecords: number;
}

interface SyncResult {
  success: boolean;
  stats?: SyncStats;
  message?: string;
  error?: string;
}

export function useNuvemshopSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  // Prevent hydration mismatch by only showing sync state after hydration
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const syncOrders = async (options: Omit<SyncOptions, "type"> = {}): Promise<SyncResult> => {
    if (isSyncing) {
      return { success: false, error: "Sincronização já em andamento" };
    }

    console.log("🚀 useNuvemshopSync: Starting orders sync");
    setIsSyncing(true);

    try {
      const params = new URLSearchParams();
      if (options.limit) params.append("limit", options.limit.toString());
      if (options.page) params.append("page", options.page.toString());
      if (options.status) params.append("status", options.status);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes timeout

      const response = await fetch(`/api/nuvemshop-sync/orders?${params}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Sync failed: ${errorText}`);
      }

      const result = await response.json();
      console.log("✅ Orders sync completed successfully:", result);

      const successMessage = `Sincronização de pedidos concluída! ${result.stats?.newRecords || 0} novos, ${result.stats?.updatedRecords || 0} atualizados.`;
      toast.success(successMessage);

      return {
        success: true,
        stats: result.stats,
        message: successMessage,
      };
    } catch (error) {
      console.error("Orders sync error:", error);

      let errorMessage = "Erro desconhecido na sincronização de pedidos";
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          errorMessage = "Sincronização de pedidos cancelada por timeout (5 minutos)";
        } else {
          errorMessage = error.message;
        }
      }

      toast.error(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      console.log("✅ useNuvemshopSync: Stopping orders sync");
      setIsSyncing(false);
    }
  };

  const syncProducts = async (options: Omit<SyncOptions, "type"> = {}): Promise<SyncResult> => {
    if (isSyncing) {
      return { success: false, error: "Sincronização já em andamento" };
    }

    console.log("🚀 useNuvemshopSync: Starting products sync");
    setIsSyncing(true);

    try {
      const params = new URLSearchParams();
      if (options.limit) params.append("limit", options.limit.toString());
      if (options.page) params.append("page", options.page.toString());
      if (options.published) params.append("published", options.published);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes timeout

      const response = await fetch(`/api/nuvemshop-sync/products?${params}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Sync failed: ${errorText}`);
      }

      const result = await response.json();
      console.log("✅ Products sync completed successfully:", result);

      const successMessage = `Sincronização de produtos concluída! ${result.stats?.newRecords || 0} novos, ${result.stats?.updatedRecords || 0} atualizados.`;
      toast.success(successMessage);

      return {
        success: true,
        stats: result.stats,
        message: successMessage,
      };
    } catch (error) {
      console.error("Products sync error:", error);

      let errorMessage = "Erro desconhecido na sincronização de produtos";
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          errorMessage = "Sincronização de produtos cancelada por timeout (5 minutos)";
        } else {
          errorMessage = error.message;
        }
      }

      toast.error(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      console.log("✅ useNuvemshopSync: Stopping products sync");
      setIsSyncing(false);
    }
  };

  const syncFull = async (options: {
    ordersLimit?: number;
    productsLimit?: number;
    ordersPages?: number;
    productsPages?: number;
  } = {}): Promise<SyncResult> => {
    if (isSyncing) {
      return { success: false, error: "Sincronização já em andamento" };
    }

    console.log("🚀 useNuvemshopSync: Starting full sync");
    setIsSyncing(true);

    try {
      const params = new URLSearchParams();
      if (options.ordersLimit) params.append("orders_limit", options.ordersLimit.toString());
      if (options.productsLimit) params.append("products_limit", options.productsLimit.toString());
      if (options.ordersPages) params.append("orders_pages", options.ordersPages.toString());
      if (options.productsPages) params.append("products_pages", options.productsPages.toString());

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 minutes timeout for full sync

      const response = await fetch(`/api/nuvemshop-sync/full?${params}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Sync failed: ${errorText}`);
      }

      const result = await response.json();
      console.log("✅ Full sync completed successfully:", result);

      const successMessage = `Sincronização completa concluída! Pedidos: ${result.ordersStats?.newRecords || 0} novos, ${result.ordersStats?.updatedRecords || 0} atualizados. Produtos: ${result.productsStats?.newRecords || 0} novos, ${result.productsStats?.updatedRecords || 0} atualizados.`;
      toast.success(successMessage);

      return {
        success: true,
        stats: result.ordersStats || result.productsStats,
        message: successMessage,
      };
    } catch (error) {
      console.error("Full sync error:", error);

      let errorMessage = "Erro desconhecido na sincronização completa";
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          errorMessage = "Sincronização completa cancelada por timeout (10 minutos)";
        } else {
          errorMessage = error.message;
        }
      }

      toast.error(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      console.log("✅ useNuvemshopSync: Stopping full sync");
      setIsSyncing(false);
    }
  };

  const handleManualSync = async (type: "orders" | "products" | "full", options: any = {}) => {
    switch (type) {
      case "orders":
        return await syncOrders(options);
      case "products":
        return await syncProducts(options);
      case "full":
        return await syncFull(options);
      default:
        toast.error("Tipo de sincronização inválido");
        return { success: false, error: "Tipo de sincronização inválido" };
    }
  };

  return {
    isSyncing: isHydrated ? isSyncing : false, // Prevent hydration mismatch
    syncOrders,
    syncProducts,
    syncFull,
    handleManualSync,
  };
}
