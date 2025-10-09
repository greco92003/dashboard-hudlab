"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useSyncContext } from "@/contexts/SyncContext";

export function useManualSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [globalSyncRunning, setGlobalSyncRunning] = useState(false);

  // Prevent hydration mismatch by only showing sync state after hydration
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Smart polling: only poll when sync is running
  useEffect(() => {
    if (!isHydrated) return;

    let activePollingInterval: NodeJS.Timeout | null = null;
    let checkForNewSyncInterval: NodeJS.Timeout | null = null;

    const checkGlobalSync = async () => {
      const isRunning = await checkSyncStatus();
      const wasRunning = globalSyncRunning;

      setGlobalSyncRunning(isRunning);

      // If sync just started, start active polling
      if (isRunning && !wasRunning) {
        console.log("🚀 Sync detected, starting active polling...");
        startActivePolling();
      }

      // If sync just finished, stop active polling
      if (!isRunning && wasRunning) {
        console.log("✅ Sync finished, stopping active polling...");
        stopActivePolling();
      }
    };

    const startActivePolling = () => {
      if (activePollingInterval) return; // Already polling

      activePollingInterval = setInterval(async () => {
        const isRunning = await checkSyncStatus();
        setGlobalSyncRunning(isRunning);

        if (!isRunning) {
          console.log("✅ Sync completed, stopping active polling...");
          stopActivePolling();
        }
      }, 2000); // Poll every 2 seconds while sync is running
    };

    const stopActivePolling = () => {
      if (activePollingInterval) {
        clearInterval(activePollingInterval);
        activePollingInterval = null;
      }
    };

    const startCheckForNewSync = () => {
      // Check for new syncs every 10 seconds when no sync is running
      checkForNewSyncInterval = setInterval(checkGlobalSync, 10000);
    };

    // Initial check
    checkGlobalSync();

    // Start checking for new syncs periodically
    startCheckForNewSync();

    return () => {
      stopActivePolling();
      if (checkForNewSyncInterval) {
        clearInterval(checkForNewSyncInterval);
      }
    };
  }, [isHydrated, globalSyncRunning]);

  // Check if there's already a sync running via API
  const checkSyncStatus = async (): Promise<boolean> => {
    try {
      const response = await fetch("/api/deals-health", {
        method: "GET",
        cache: "no-cache",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      });

      if (response.ok) {
        const data = await response.json();
        return data.sync?.isRunning || false;
      }
    } catch (error) {
      console.warn("❌ Error checking sync status:", error);
    }
    return false;
  };

  const handleManualSync = async () => {
    // Check if there's already a sync running (local or global) BEFORE any action
    if (isSyncing || globalSyncRunning) {
      toast.warning(
        "Uma sincronização já está em andamento. Aguarde a finalização para iniciar outra.",
        {
          duration: 4000,
          position: "bottom-right", // Toast no rodapé, diferente do alert superior
        }
      );
      return; // Return early WITHOUT activating loading state
    }

    console.log("🚀 useManualSync: Starting sync");
    setIsSyncing(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 minutes timeout

      // Use robust-deals-sync-parallel endpoint for manual sync button
      // This endpoint syncs all deals from ActiveCampaign AND logs to deals_sync_log
      // This allows SyncChecker to monitor the sync progress and show success/error alerts
      const syncEndpoint = "/api/test/robust-deals-sync-parallel?allDeals=true";

      const isLocalhost =
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1");

      const isDev = process.env.NODE_ENV === "development" || isLocalhost;

      console.log(
        `🔄 Manual sync using robust-deals-sync-parallel endpoint: ${syncEndpoint}`
      );
      console.log(
        `🔍 Environment: ${isDev ? "development" : "production"}, NODE_ENV: ${
          process.env.NODE_ENV
        }, hostname: ${
          typeof window !== "undefined" ? window.location.hostname : "server"
        }`
      );

      const response = await fetch(syncEndpoint, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();

        // Handle conflict status (409) - sync already running
        if (response.status === 409) {
          try {
            const errorData = JSON.parse(errorText);
            toast.warning(
              errorData.error ||
                "Uma sincronização já está em andamento. Aguarde a finalização para iniciar outra.",
              {
                duration: 4000,
              }
            );
            return; // Don't throw error, just return
          } catch (parseError) {
            toast.warning(
              "Uma sincronização já está em andamento. Aguarde a finalização para iniciar outra.",
              {
                duration: 4000,
              }
            );
            return;
          }
        }

        throw new Error(`Sync failed: ${errorText}`);
      }

      const result = await response.json();
      console.log("✅ Sync completed successfully:", result);

      // Refresh the data after successful sync
      console.log("✅ Test sync completed, refreshing data...");
      setTimeout(() => {
        window.location.reload();
      }, 2000); // Increased delay to allow success alert to show
    } catch (error) {
      console.error("Manual sync error:", error);

      let errorMessage = "Erro desconhecido";
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          errorMessage = "Sincronização cancelada por timeout (10 minutos)";
        } else {
          errorMessage = error.message;
        }
      }

      // Error will be handled by SyncChecker component
      console.error("❌ Manual sync failed:", errorMessage);
    } finally {
      console.log("✅ useManualSync: Stopping sync");
      setIsSyncing(false);
    }
  };

  return {
    isSyncing: isHydrated ? isSyncing || globalSyncRunning : false, // Show loading if local OR global sync is running
    handleManualSync,
  };
}
