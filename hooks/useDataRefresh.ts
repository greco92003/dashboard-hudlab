"use client";

import { useEffect, useCallback } from "react";
import { useSyncContext } from "@/contexts/SyncContext";

/**
 * Hook para registrar uma página para atualização automática após sync
 * @param pageKey - Identificador único da página (ex: 'dashboard', 'deals', 'sellers')
 * @param refreshCallback - Função que será chamada para atualizar os dados da página
 */
export function useDataRefresh(pageKey: string, refreshCallback: () => void) {
  const { registerPageRefresh, unregisterPageRefresh } = useSyncContext();

  // Memoize the refresh callback to prevent unnecessary re-registrations
  const memoizedRefreshCallback = useCallback(refreshCallback, [refreshCallback]);

  useEffect(() => {
    // Register the page for automatic refresh after sync
    registerPageRefresh(pageKey, memoizedRefreshCallback);

    // Cleanup: unregister when component unmounts
    return () => {
      unregisterPageRefresh(pageKey);
    };
  }, [pageKey, memoizedRefreshCallback, registerPageRefresh, unregisterPageRefresh]);
}
