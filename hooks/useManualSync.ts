"use client";

import { useState, useEffect } from "react";

export function useManualSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  // Prevent hydration mismatch by only showing sync state after hydration
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const handleManualSync = async () => {
    if (isSyncing) return;

    console.log("🚀 useManualSync: Starting sync");
    setIsSyncing(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes timeout

      const response = await fetch("/api/test/robust-deals-sync", {
        method: "GET",
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
          errorMessage = "Sincronização cancelada por timeout (5 minutos)";
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
    isSyncing: isHydrated ? isSyncing : false, // Prevent hydration mismatch
    handleManualSync,
  };
}
